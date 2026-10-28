// One active write and one replaceable pending snapshot. No Shell actors live here.
export class WriteQueue {
    constructor(persist, { schedule, cancel, report, maxRetries = 3 }) {
        Object.assign(this, { persist, schedule, cancel, report, maxRetries });
        this.pending = null;
        this.active = null;
        this.timer = null;
        this.failures = 0;
        this.stopping = false;
    }

    request(snapshot) {
        this.pending = snapshot;
        this.stopping = false;
        this.failures = 0;
        this._cancelRetry();
        this._start();
    }

    _cancelRetry() {
        if (this.timer !== null) this.cancel(this.timer);
        this.timer = null;
    }

    _start() {
        if (this.active || this.pending === null) return;
        const snapshot = this.pending;
        this.pending = null;
        // Start in a microtask so active is set even if persist throws immediately.
        this.active = Promise.resolve().then(() => this.persist(snapshot)).then(() => {
            this.failures = 0;
        }, error => {
            // Never put an older failed snapshot ahead of a newer request.
            if (this.pending === null) this.pending = snapshot;
            this.failures++;
            this.report(error);
        }).then(() => {
            this.active = null;
            if (this.pending === null) return;
            if (this.failures === 0) this._start();
            else if (!this.stopping && this.failures <= this.maxRetries) {
                this.timer = this.schedule(() => {
                    this.timer = null;
                    this._start();
                }, 250 * 2 ** (this.failures - 1));
            }
        });
    }

    async flush() {
        // Disable timers on shutdown; finish the active write and make one final
        // attempt with the newest pending state. Keep failed data for next request.
        this.stopping = true;
        this._cancelRetry();
        while (this.active) await this.active;
        if (this.pending !== null) {
            this._start();
            while (this.active) await this.active;
        }
        return this.pending === null;
    }
}
