"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.2
 *
 * Get AI state: https://docs.google.com/document/d/10Ec4sRt8S4RC1L7w662UVTCHuihktO2d/edit
 */

const utils = require("@iobroker/adapter-core");
const got = require("got");

let pollingTimer;

class Reolink extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: "reolink",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    async onReady() {
        this.setState("info.connection", false, true);
        this.log.info("config motion detection polling: " + this.config.mdPollingInterval);
        this.log.info("config address: " + this.config.cameraIpAddress);
        this.log.info("config username: " + this.config.cameraUsername);
        this._createFolderObject("ai_motion_detection");

        const t = this;
        pollingTimer = this.setInterval(async function () {
            await t._onPollingTick();
        }, this.config.mdPollingInterval);
        this._onPollingTick();
    }

    onUnload(callback) {
        try {
            this.clearInterval(pollingTimer);
            callback();
        } catch (e) {
            callback();
        }
    }

    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    async _onPollingTick() {
        this.log.info("Updating data from camers.");
        const aiMotionResponse = await this._requestGet(this._buildAiStateUri());
        const motionStateObject = aiMotionResponse.body[0];

        if (motionStateObject.code != 0) {
            this.log.warn("Invalid response code: " + motionStateObject.code);
            return;
        }

        if (typeof motionStateObject.value !== "object") {
            this.log.warn("Invalid status response: " + motionStateObject.value);
            return;
        }

        Object.keys(motionStateObject.value).forEach(sub => {
            const value = motionStateObject.value[sub];

            if (sub === "channel") {
                this.log.debug("Processing channel: " + value);
                this._createFolderObject("ai_motion_detection.channels." + value);
            } else if (typeof value === "object") {
                this.log.debug("Processing detection " + sub + ": " + this._stringify(value));
                const channel = motionStateObject.value["channel"];
                this._createStateObject(
                    "ai_motion_detection.channels." + channel + "." + sub + ".support",
                    "support",
                    "boolean",
                    "indicator",
                    false
                );
                this._createStateObject(
                    "ai_motion_detection.channels." + channel + "." + sub + ".state",
                    "state",
                    "boolean",
                    "indicator",
                    false
                );
                this._setState("ai_motion_detection.channels." + channel + "." + sub + ".support", Boolean(value.support));
                this._setState("ai_motion_detection.channels." + channel + "." + sub + ".state", Boolean(value.alarm_state));
            } else {
                // ignore
            }
        });
        // this.log.debug("Response: " + this._stringify(motionStateObject));
    }

    _stringify(motionStateObject) {
        return JSON.stringify(motionStateObject, null, "\t");
    }

    _buildAiStateUri() {
        return "http://" + this.config.cameraIpAddress + "/cgi-bin/api.cgi?cmd=GetAiState&rs=&user=" + this.config.cameraUsername + "&password=" + this.config.cameraPassword;
    }

    async _requestGet(requestUrl) {
        return await got.get(requestUrl, {
            responseType: "json",
            timeout: {
                response: 3000,
                request: 3000
            }
        });
    }

    _createStateObject(id, name, type, role, canWrite) {
        this.setObjectNotExists(id, {
            type: "state",
            common: {
                name: name,
                type: type,
                role: role,
                read: true,
                write: canWrite,
            },
            native: {},
        });
    }
    _setState(elementPath, element) {
        this.setState(elementPath, {
            val: element,
            ack: true
        });
    }
    _createFolderObject(name) {
        this.setObjectNotExists(name, {
            type: "folder",
            common: {
                name: name
            },
            native: {},
        });
    }
}

if (require.main !== module) {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Reolink(options);
} else {
    new Reolink();
}