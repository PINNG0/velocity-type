import { Car } from '../car/Car.js';
import { CarStats } from '../car/CarStats.js';
import { OpponentCar } from '../car/OpponentCar.js';

const EVENT_GRACE_SECONDS = 4;

export class Race {
    constructor(config) {
        const raceConfig = config.race ?? config;
        const opponentsConfig = config.opponents ?? [];

        this.targetDistance = raceConfig.targetDistance;

        this.car = new Car(new CarStats({
            maxSpeed: raceConfig.maxSpeedKmh
        }));

        this.opponents = opponentsConfig.map((opponent, index) =>
            new OpponentCar({
                ...opponent,
                lane: index
            })
        );

        this.startedAt = null;
        this.finishedAt = null;
        this.finished = false;
        this.winner = null;
        this.pausedAt = null;
        this.totalPausedTime = 0;
        this.maxPlayerSpeed = 0;

        // Tempo de simulação acumulado: coerente com a distância percorrida mesmo se um
        // quadro for limitado pelo clamp do delta (antes usava o relógio de parede).
        this.elapsed = 0;
        this.events = [];
        this.lastPlayerPosition = null;
        // Classificação reutilizável (sem alocar objetos a cada quadro).
        // Entradas fixas (uma por piloto); `standings` é o mesmo array reordenado em sítio.
        this.playerEntry = { type: 'player', id: 'player', name: 'Você', position: 0, speed: 0 };
        this.opponentEntries = this.opponents.map(o => ({ type: 'opponent', id: o.id, name: o.name, position: 0, speed: 0, color: o.color, lane: o.lane }));
        this.standings = [this.playerEntry, ...this.opponentEntries];
    }

    start() {
        this.car.reset();

        this.opponents.forEach((opponent, index) => {
            opponent.start(-80 * index);
        });

        this.startedAt = performance.now();
        this.finishedAt = null;
        this.finished = false;
        this.winner = null;
        this.pausedAt = null;
        this.totalPausedTime = 0;
        this.maxPlayerSpeed = 0;
        this.elapsed = 0;
        this.events.length = 0;
        this.refreshStandings();
        this.lastPlayerPosition = this.playerPosition;
    }

    pause() {
        if (this.pausedAt === null && !this.finished) {
            this.pausedAt = performance.now();
        }
    }

    resume() {
        if (this.pausedAt !== null) {
            this.totalPausedTime += performance.now() - this.pausedAt;
            this.pausedAt = null;
        }
    }

    update(deltaTime) {
        if (this.finished || this.startedAt === null || this.pausedAt !== null) {
            return;
        }

        this.elapsed += Math.max(0, deltaTime);
        this.car.update(deltaTime);
        this.maxPlayerSpeed = Math.max(this.maxPlayerSpeed, this.car.speed);

        const raceTimeMs = this.elapsed * 1000;

        this.opponents.forEach(opponent => {
            opponent.update(deltaTime, raceTimeMs, opponent.position / this.targetDistance, opponent.position - this.car.position);
        });

        const sorted = this.refreshStandings();
        const place = this.playerPosition;
        // Nos primeiros segundos os rivais já largam em movimento: não anunciar "ultrapassagens" na largada.
        if (this.elapsed >= EVENT_GRACE_SECONDS && this.lastPlayerPosition !== null && place !== this.lastPlayerPosition) {
            this.events.push({ type: place < this.lastPlayerPosition ? 'overtake' : 'overtaken', from: this.lastPlayerPosition, to: place });
            if (this.events.length > 20) this.events.shift();
        }
        this.lastPlayerPosition = place;

        if (sorted[0].position >= this.targetDistance) {
            const winner = sorted[0];

            this.finished = true;
            this.winner = winner;
            this.finishedAt = performance.now();

            if (winner.type === 'player') {
                this.car.position = this.targetDistance;
            }
        }
    }

    get elapsedSeconds() {
        return this.elapsed;
    }

    get progress() {
        return Math.min(this.car.position / this.targetDistance, 1);
    }

    get playerPosition() {
        for (let i = 0; i < this.standings.length; i++) if (this.standings[i].type === 'player') return i + 1;
        return this.standings.length;
    }

    get playerWon() {
        return this.winner?.type === 'player';
    }

    get winnerName() {
        return this.winner?.name ?? '—';
    }

    // Atualiza e ordena a classificação em sítio. Retorna o MESMO array a cada chamada
    // (não modifique): evita alocações no loop de 60 FPS.
    refreshStandings() {
        this.playerEntry.position = this.car.position;
        this.playerEntry.speed = this.car.speed;
        for (let i = 0; i < this.opponents.length; i++) {
            this.opponentEntries[i].position = this.opponents[i].position;
            this.opponentEntries[i].speed = this.opponents[i].speed;
        }
        this.standings.sort((a, b) => b.position - a.position);
        return this.standings;
    }

    getSortedCars() {
        return this.refreshStandings();
    }

    drainEvents() {
        if (!this.events.length) return [];
        return this.events.splice(0, this.events.length);
    }
}
