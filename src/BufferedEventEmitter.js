const ERR_BUFFER_NOT_FOUND = "BUFFER NOT FOUND";
const ERR_BUFFER_ALREADY_EXISTS = "BUFFER ALREADY EXISTS";

const FLUSH_BUFFER_EVENT_NAME = "BUFFER:flush";
const CLEAN_BUFFER_EVENT_NAME = "BUFFER:clean";

const BUFFER_RETENTION_PERIOD_SECONDS = 1;
const MAINTENANCE_CHANCE = 100;

const cp = object => Object.assign({}, object);
const isObject = object => typeof object === "object";

/** @type {BufferedEventEmitterOptions} */
const defaultOptions = {ttl: BUFFER_RETENTION_PERIOD_SECONDS, maintenanceChance: MAINTENANCE_CHANCE};

class BufferedEventEmitter {
    /**
     * @param {BufferedEventEmitterOptions} options
     */
    constructor(options) {
        this._debug = false;

        /** @type {Object} */
        this._map = {};

        /** @type {BufferedEventEmitterBufferHash} */
        this._bufferedMessages = {};

        this._ttl = options.ttl || defaultOptions.ttl;
        this._maintenanceChance = options.maintenanceChance || defaultOptions.maintenanceChance;
    }

    /**
     * Enable/disable debug mode (console.log everywhere ;))
     * @param {Boolean} value
     * @returns void
     * @memberof BufferedEventEmitter
     */
    debugEnable(value) {
        this._debug = !!value;
    }

    /**
     * Creates a named buffer
     *
     * @param {Number|String} bufferId
     * @param {any} context
     * @memberof BufferedEventEmitter
     */
    createBuffer(bufferId, context) {
        this._log(`Trying to create buffer ${bufferId}`);
        this._checkMaintenance();

        if (this._bufferedMessages.hasOwnProperty(bufferId)) {
            throw ERR_BUFFER_ALREADY_EXISTS;
        }

        /** @type {BufferedEventEmitterBuffer} */
        const buffer = {
            id: bufferId,
            context: isObject(context) ? cp(context) : context,
            created: new Date(),
            lastActivity: new Date(),
            events: {}
        };

        this._bufferedMessages[bufferId] = buffer;

        this._log(`Buffer ${bufferId} created`);
    }

    /**
     * Add and event to the buffer.
     * Will store the event until the buffer is flushed
     * @param {Number|String} bufferId
     * @param {String} eventName
     * @param {any} message
     */
    emitBuffered(bufferId, eventName, message) {
        this._log(`Emitting buffered event ${eventName} on buffer ${bufferId}`);

        /** @type {BufferedEventEmitterBuffer} */
        const buffer = this._getBuffer(bufferId);
        if (!buffer.events.hasOwnProperty(eventName)) {
            this._log(`Creating event ${eventName} on buffer ${bufferId}`);
            buffer.events[eventName] = [];
        }

        const args = Array.prototype.slice.call(arguments, 2);
        buffer.events[eventName].push(args);
        buffer.lastActivity = new Date();

        this._log(`Buffer ${bufferId} updated`);
    }

    /**
     * Flushes the buffer, calling the registered handlers for all events
     * @param {String|Number} bufferId
     * @return {Boolean} Even when flush returns false, the handlers will be called. Maintenance will try to remove it after a few moments
     */
    flush(bufferId) {
        this._log(`Trying to flush buffer ${bufferId}`);
        /** @type {BufferedEventEmitterBuffer} */
        const buffer = this._getBuffer(bufferId, true);
        const context = isObject(buffer.context) ? cp(buffer.context) : buffer.context;

        if (this._map.hasOwnProperty(FLUSH_BUFFER_EVENT_NAME)) {
            this._log(`Calling handlers for flush event`);
            this._map[FLUSH_BUFFER_EVENT_NAME].forEach(fn => fn.call(null, buffer.id, buffer.context, buffer.events));
        }

        this._log(`Calling handlers for buffered events`);
        Object.keys(this._getBuffer(bufferId).events).forEach(eventName => {
            if (this._map.hasOwnProperty(eventName)) {
                this._getBuffer(bufferId).events[eventName].forEach(event => {
                    event.push(isObject(context) ? cp(context) : context);

                    this._map[eventName].forEach(function (fn) {
                        fn.apply(this, event);
                    });
                });
            }
        });

        return delete this._bufferedMessages[bufferId];
    }

    /**
     * Remove all data from the buffer. Just the global clean buffer event will be emitted
     * @param {Number|String} bufferId
     */
    cleanBuffer(bufferId) {
        this._log(`Cleaning buffer ${bufferId}`);
        const buffer = this._getBuffer(bufferId, true);

        if (this._map.hasOwnProperty(CLEAN_BUFFER_EVENT_NAME)) {
            this._log(`Calling clean buffer event handler`);
            this._map[CLEAN_BUFFER_EVENT_NAME].forEach(fn => fn.call(null, buffer.id, buffer.context, buffer.events));
        }

        return delete this._bufferedMessages[bufferId];
    }

    /**
     * Add an event listener
     *
     * @param {String} eventName Event's name
     * @param {Function} fn Handler
     * @returns {Function} the "unsubscriber". Call this function to unsubscribe this event (or use the unsubscribe method)
     *
     * @memberOf EventManager
     */
    subscribe(eventName, fn) {
        if (typeof eventName !== "string") {
            throw "eventName must be string";
        }

        if (!eventName.length) {
            throw "eventName cannot be empty";
        }

        if (!this._map.hasOwnProperty(eventName)) {
            this._map[eventName] = [];
        }

        this._map[eventName].push(fn);
        return this.unsubscribe.bind(this, eventName, fn);
    }

    /**
     * @see subscribe
     * Add an event listener to multiple event aht the sabe time
     *
     * @param {String[]} eventNames Event's names
     * @param {Function} fn Handler
     * @return {Function} Unsubscriber for all events
     * @see EventManager.subscribe
     *
     * @memberOf EventManager
     */
    subscribeMultiple(eventNames, fn) {
        let i, length = eventNames.length;

        const unsubscribes = eventNames.map(eventName => this.subscribe(eventName, fn));
        return () => unsubscribes.forEach(unsubscribe => unsubscribe());
    }

    /**
     * Removes an event listener from an event
     *
     * @param {string} eventName Event's name
     * @param {Function} fn Handler to remove
     *
     * @memberOf EventManager
     */
    unsubscribe(eventName, fn) {
        if (!this._map[eventName]) {
            return;
        }

        let index = this._map[eventName].indexOf(fn);
        if (index !== -1) {
            this._map[eventName].splice(index, 1);
        }
    }

    /**
     * @see unsubscribe
     * Removes the event listener from multiple events
     *
     * @param {String[]} eventNames Event's names
     * @param {Function} fn
     *
     * @memberOf EventManager
     */
    unsubscribeMultiple(eventNames, fn) {
        let i, length = eventNames.length;

        for (i = 0; i < length; i++) {
            this.unsubscribe(eventNames[i], fn);
        }
    }

    /**
     * Removes all event listeners from the given events
     *
     * @param {String[]} eventNames
     *
     * @memberOf EventManager
     */
    unsubscribeAll(eventNames) {
        eventNames.forEach(name => {
            if (this._map.hasOwnProperty(name)) {
                delete this._map[name];
            }
        });
    }

    /**
     * Trigger an event. Will send all arguments after eventName to the existent
     * event listeners
     *
     * @param {String} eventName Event's name
     *
     * @memberOf EventManager
     */
    emit(eventName) {
        this._log(`Emitting event ${eventName}`);

        if (!this._map.hasOwnProperty(eventName)) {
            return;
        }

        // make an copy of the arguments to prevent someone to change it
        let args = Array.prototype.slice.call(arguments, 1);
        this._map[eventName].forEach(function (fn) {
            fn.apply(this, args);
        });
    }

    _validateBufferExists(id) {
        if (!this._bufferedMessages.hasOwnProperty(id)) {
            throw ERR_BUFFER_NOT_FOUND;
        }
    }

    /**
     * Get the buffer object
     * @param {Number|String} bufferId
     * @param {Boolean} shoudCopy if true, the buffer will be cloned (use to avoid change the data)
     * @returns {BufferedEventEmitterBuffer}
     */
    _getBuffer(bufferId, shoudCopy = false) {
        this._validateBufferExists(bufferId);
        return shoudCopy ? cp(this._bufferedMessages[bufferId]) : this._bufferedMessages[bufferId];
    }

    /**
     * Determine if the maintenance should be done and do it
     *
     * @memberof BufferedEventEmitter
     */
    _checkMaintenance() {
        this._log("Checking maintenance...");
        if (Math.random() <= MAINTENANCE_CHANCE / 100) {
            try {
                this._maintenance();
            } catch (e) {
                console.log(`Failed to run maintenance: ${e}`);
            }
        }
    }

    _maintenance() {
        this._log("Running maintenance...");
        Object.keys(this._bufferedMessages).forEach(id => {
            const buffer = this._getBuffer(id);
            const now = new Date();

            const diff = now.getTime() - buffer.lastActivity.getTime();
            const seconds = Math.abs(diff / 1000);

            if (seconds > BUFFER_RETENTION_PERIOD_SECONDS) {
                this.cleanBuffer(id);
            }
        });
    }

    /**
     * Simple log
     * @param {String} message
     * @memberof BufferedEventEmitter
     */
    _log(message) {
        this._log && console.log(message);
    }
};

BufferedEventEmitter.FLUSH_BUFFER_EVENT_NAME = FLUSH_BUFFER_EVENT_NAME;
BufferedEventEmitter.CLEAN_BUFFER_EVENT_NAME = CLEAN_BUFFER_EVENT_NAME;

module.exports = BufferedEventEmitter;
