import { StorageService, StorageKeys } from './StorageService.js';
import { PlayerProfile } from '../domain/progression/PlayerProfile.js';
import { levelFromXp } from '../domain/progression/XpCalculator.js';

export class ProfileService {
    static load(now = new Date()) { return PlayerProfile.sanitize(StorageService.get(StorageKeys.profile), now); }
    static save(profile) { return StorageService.set(StorageKeys.profile, profile); }
    static summary(profile = this.load()) { return { totalXp: profile.totalXp, createdAt: profile.createdAt, ...levelFromXp(profile.totalXp) }; }
    static reset() { StorageService.remove(StorageKeys.profile); }
}
