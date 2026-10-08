import { PRODUCT_NAME } from "@/config/site";
import { messages } from "@/i18n";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-5">
      <h1 className="text-destination font-extrabold tracking-[-0.02em] text-ink">{PRODUCT_NAME}</h1>
      <p className="text-corps text-ink-soft">{messages.accueil.promesse}</p>
    </main>
  );
}
