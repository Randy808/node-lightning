import { ILogger } from "@node-lightning/logger";
import { Transform } from "stream";
import { InitFeatureFlags } from "../flags/InitFeatureFlags";
import { IWireMessage } from "../messages/IWireMessage";
import { MessageType } from "../MessageType";
import { IPeer, Peer } from "../Peer";
import { PeerState } from "../PeerState";
import { GossipError, GossipErrorCode } from "./GossipError";
import { GossipFilter } from "./GossipFilter";
import { GossipQueriesReceiver } from "./GossipQueriesReceiver";
import { GossipQueriesSync } from "./GossipQueriesSync";

/**
 * Implements a decorator for the standard Peer adding functionality for Gossip
 * related activities. Messages from the GossipPeer occur after being pushed
 * through a GossipFilter to validate they are aokay.
 */
export class GossipPeer extends Transform implements IPeer {
    public readonly logger: ILogger;

    private _receiver: GossipQueriesReceiver;
    private _syncRangeTask: GossipQueriesSync;

    /**
     * This class expects to be instantiated by a peer that is read and will
     * throw if the peer is not yet in the ready state. This ensures we can
     * construct the GossipPeer correctly using the negotiated features
     * @param peer
     * @param filter
     * @param logger
     */
    constructor(readonly peer: Peer, readonly filter: GossipFilter, logger: ILogger) {
        super({ objectMode: true, highWaterMark: peer.highWaterMark });

        // Enforce that the peer is ready to rock
        if (peer.state !== PeerState.Ready) {
            throw new GossipError(GossipErrorCode.PeerNotReady);
        }

        // Construct a sub-logger for use by the Gossiping systems
        this.logger = logger.sub("gspeer", peer.id);

        // Attach the appropriate events, many of them will simply be forwarded
        // but we will intercept messages and funnel appropriate messages
        // through the filter.
        this.peer.pipe(this);
        this.peer.on("close", () => this.emit("close"));
        if (this.gossipQueries) {
            this._receiver = new GossipQueriesReceiver(
                this.peer.localFeatures[0],
                this.peer,
                this.logger,
            );
        }
    }

    /**
     * Returns true if the gossip_queries feature has been negotiated with the
     * remote peer.
     */
    public get gossipQueries(): boolean {
        return (
            this.peer.remoteFeatures.isSet(InitFeatureFlags.gossipQueriesOptional) ||
            this.peer.remoteFeatures.isSet(InitFeatureFlags.gossipQueriesRequired)
        );
    }

    /**
     * Performs Gossip synchronization using the negotiated strategy. Currently
     * only support gossip_queries
     * @param firstBlock
     * @param numBlocks
     */
    public async syncRange(firstBlock?: number, numBlocks?: number): Promise<boolean> {
        if (this.gossipQueries) {
            const chainHash = this.peer.localChains[0];
            this._syncRangeTask = new GossipQueriesSync(chainHash, this, this.logger);
            await this._syncRangeTask.queryRange(firstBlock, numBlocks);
            this._syncRangeTask = undefined;
            return true;
        }
        return false;
    }

    /**
     * Enables the receipt of rumor mongered messages.
     */
    public enableGossip() {
        if (this.gossipQueries) {
            this._receiver.activate();
        }
    }

    /**
     * Disables the receipt of rumor mongered messages.
     */
    public disableGossip() {
        if (this.gossipQueries) {
            this._receiver.deactivate();
        }
    }

    /**
     * Sends the serialized data to the peer.
     * @param buf
     */
    public send(buf: Buffer) {
        this.peer.send(buf);
    }

    /**
     * Sends a message to the peer using the default serialization.
     * @param msg
     */
    public sendMessage(msg: IWireMessage) {
        this.peer.sendMessage(msg);
    }

    /**
     * Disconnects the peer
     */
    public disconnect() {
        this.peer.disconnect();
    }

    /**
     * Handles when the peer is readable by iterating available messages
     * and adding them to the filter.
     */
    private _onPeerReadable() {
        this.emit("readable");
    }

    /**
     * Internally process messages. If the message is a routing related message
     * it will pass through the GossipFilter, otherwise it will be immediately
     * broadcast.
     * @param msg
     */
    public _transform(msg: IWireMessage, encoding: string, cb: (err?: Error) => void) {
        // HACK: we're adding the sync task message tracking here
        if (this._syncRangeTask) {
            this._syncRangeTask.handleWireMessage(msg);
        }
        if (
            msg.type === MessageType.ChannelAnnouncement ||
            msg.type === MessageType.ChannelUpdate ||
            msg.type === MessageType.NodeAnnouncement
        ) {
            this.filter
                .validateMessage(msg)
                .then(result => {
                    if (result.isOk) {
                        for (msg of result.value) {
                            this.push(msg);
                        }
                        cb();
                    } else {
                        cb(result.error);
                    }
                })
                .catch(err => cb(err));
        } else {
            // Relays all messages
            this.push(msg);
            cb();
        }
    }
}
