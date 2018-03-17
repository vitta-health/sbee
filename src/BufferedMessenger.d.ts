interface BufferedEventEmitter {
    constructor(options: BufferedEventEmitterOptions)

    createBuffer(bufferId: Number|String, context: any): void
    clearBuffer(bufferId: Number|String): Boolean
    flush(bufferId: Number|String): Boolean
    emit(eventName: String, data: any): void
    emitBuffered(bufferId: Number|String, eventName: String, data: any): void
    subscribe(eventName: String, handler: Function): Function
    subscribeMultiple(eventsName: String[], handler: Function): Function
    unsubscribe(eventName: String, handler: Function): void
    unsubscribeMultiple(eventsName: String, handler: Function): void
    unsubscribeAll(eventsName: String): void

    debugEnable(value: Boolean): void
}

interface BufferedEventEmitterOptions {
    ttl?: Number
    maintenanceChance?: Number
}

interface BufferedEventEmitterBuffer {
    id: Number|String
    context: any
    created: Date
    lastActivity: Date
    events: BufferedEventEmitterBufferEvents
}

interface BufferedEventEmitterBufferHash {
    [key: String]: BufferedEventEmitterBuffer[]
}

interface BufferedEventEmitterBufferEvents {
    [key: String]: Array[]
}