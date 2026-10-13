export class TrackSegment {
    constructor({ start, end, type = 'straight' }) {
        this.start = start;
        this.end = end;
        this.type = type;
    }

    get length() {
        return Math.max(this.end - this.start, 0);
    }
}
