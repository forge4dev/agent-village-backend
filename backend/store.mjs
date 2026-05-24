import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { seedWorld } from './engine.mjs';

export class JsonStore {
  constructor(path) {
    this.path = path;
    this.world = null;
    this.writeChain = Promise.resolve();
    this.mutationChain = Promise.resolve();
  }

  async load() {
    try {
      this.world = JSON.parse(await readFile(this.path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.world = seedWorld();
      await this.save();
    }
    return this.world;
  }

  async mutate(fn) {
    if (!this.world) await this.load();
    const run = this.mutationChain.then(async () => {
      const result = await fn(this.world);
      await this.save();
      return result;
    });
    this.mutationChain = run.catch(() => {});
    return run;
  }

  async read(fn) {
    if (!this.world) await this.load();
    return fn(this.world);
  }

  async reset() {
    return this.mutate((world) => {
      this.world = seedWorld();
      return this.world;
    });
  }

  async save() {
    await mkdir(dirname(this.path), { recursive: true });
    this.writeChain = this.writeChain.then(async () => {
      const tmpPath = `${this.path}.tmp`;
      await writeFile(tmpPath, `${JSON.stringify(this.world, null, 2)}\n`);
      await rename(tmpPath, this.path);
    });
    return this.writeChain;
  }
}
