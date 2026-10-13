export class AssetService {
    async loadJSON(path) {
        const response = await fetch(path);

        if (!response.ok) {
            throw new Error(`Não foi possível carregar ${path}`);
        }

        return response.json();
    }
}
