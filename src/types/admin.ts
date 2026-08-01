/**
 * Arquivo de backup como a tela o enxerga.
 *
 * Mora em `types/` e não junto do serviço porque o componente de tela precisa dele — e o
 * serviço importa `child_process` e `fs`. Enquanto for `import type` a distinção some na
 * compilação, mas basta alguém apagar a palavra `type` para o build do navegador quebrar.
 */
export interface BackupFile {
  name: string;
  sizeBytes: number;
  /** ISO. */
  createdAt: string;
}
