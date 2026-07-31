import Image from "next/image";
import { cn } from "@/lib/utils";

/** Caminho único da marca — trocar o arquivo em public/ atualiza o app inteiro. */
export const LOGO_SRC = "/icon.png";

/**
 * Ícone oficial do InvestHub.
 *
 * Servido via next/image: o arquivo original tem 1254px e mais de 1 MB, e o Next
 * entrega automaticamente a versão redimensionada e comprimida para cada tamanho.
 */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src={LOGO_SRC}
      alt="InvestHub"
      width={size}
      height={size}
      priority
      className={cn("rounded-lg", className)}
    />
  );
}

/** "INVEST" na cor do texto + "HUB" no dourado da marca. */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      INVEST<span className="text-[#D9A73F]">HUB</span>
    </span>
  );
}

interface LogoProps {
  className?: string;
  /** Lado do ícone em pixels. */
  size?: number;
  markClassName?: string;
  wordmarkClassName?: string;
  showTagline?: boolean;
}

/**
 * Ícone + nome, para espaços estreitos como a sidebar.
 *
 * O nome vem como texto (e não recortado da imagem) porque, reduzido a poucos pixels,
 * o texto embutido no arquivo ficaria ilegível.
 */
export function Logo({
  className,
  size = 32,
  markClassName,
  wordmarkClassName,
  showTagline,
}: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} className={markClassName} />
      <span className="flex flex-col leading-none">
        <LogoWordmark className={wordmarkClassName} />
        {showTagline && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#D9A73F]">
            Invista melhor. Viva o futuro.
          </span>
        )}
      </span>
    </span>
  );
}

/** Marca completa em tamanho grande — usa o lockup do próprio arquivo, com o nome já embutido. */
export function LogoLockup({ className, size = 200 }: { className?: string; size?: number }) {
  return (
    <Image
      src={LOGO_SRC}
      alt="InvestHub — Invista melhor. Viva o futuro."
      width={size}
      height={size}
      priority
      className={cn("rounded-2xl", className)}
    />
  );
}
