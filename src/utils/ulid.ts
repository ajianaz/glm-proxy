import { ulid } from 'ulidx';

export function generateId(): string {
  return ulid().toLowerCase();
}

export function generateApiKey(): string {
  return `ajianaz_${generateId()}`;
}
