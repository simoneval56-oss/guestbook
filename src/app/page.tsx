import Image from "next/image";
import Link from "next/link";
import { LayoutCarousel } from "../components/layout-carousel";
import { LAYOUTS } from "../lib/layouts";
import { createServerSupabaseClient } from "../lib/supabase/server";

export default async function HomePage() {
  const supabase = createServerSupabaseClient() as any;
  const {
    data: { session }
  } = await supabase.auth.getSession();
  const isAuthenticated = Boolean(session);

  return (
    <div className="grid" style={{ gap: 32 }}>
      <header className="topbar">
        <div className="brand">
          <Image
            src="/images/logo.png"
            alt="Logo GuestHomeBook"
            width={56}
            height={56}
            priority
            className="brand-logo"
            style={{ height: 56, width: "auto" }}
            sizes="64px"
          />
          <div className="brand-wordmark">
            <Image
              src="/images/nome-sito.png"
              alt="GuestHomeBook wordmark"
              width={260}
              height={60}
              priority
              className="brand-wordmark-img"
              sizes="320px"
            />
          </div>
        </div>
        <div className="topbar-actions">
          <Link className="btn btn-secondary" href="/login">
            Accedi
          </Link>
          <Link className="btn" href="/register">
            Registrati
          </Link>
        </div>
      </header>

      <section className="hero-guestbook">
        <div className="hero-guestbook__bg hero-guestbook__bg--left" aria-hidden={true}>
          <Image
            src="/images/parte-1/imm-sezione-1.png"
            alt=""
            fill
            sizes="(max-width: 900px) 200px, 260px"
            className="hero-guestbook__bg-image"
            priority
          />
        </div>
        <div className="hero-guestbook__bg hero-guestbook__bg--right" aria-hidden={true}>
          <Image
            src="/images/parte-1/imm1-sezione-1.png"
            alt=""
            fill
            sizes="(max-width: 900px) 200px, 260px"
            className="hero-guestbook__bg-image"
            priority
          />
        </div>
        <div className="hero-guestbook__content hero-typeface">
          <h1 className="hero-guestbook__title">
            {"Guestbook digitale: l'accoglienza smart per la tua struttura!"}
          </h1>
          <p className="hero-guestbook__lead">
            GuestHomeBook è la piattaforma ideale per creare in pochi click guestbooks digitali
            personalizzati per la tua struttura ricettiva. Risparmia tempo e migliora la comunicazione con
            i tuoi ospiti con una guida interattiva e sempre aggiornata.
          </p>
        </div>
      </section>

      <section className="section-2">
        <div className="section-2__inner hero-typeface">
          <div className="section-2__image">
            <Image
              src="/images/parte-1/imm-sezione-2.png"
              alt="Illustrazione di messaggi e busta delle comunicazioni con gli ospiti"
              fill
              className="section-2__image-asset"
              sizes="(max-width: 960px) 82vw, 620px"
              priority
            />
          </div>
          <div className="section-2__text">
            <h3 className="section-2__title">La tua casa, la tua guida, il tuo stile!</h3>
            <p className="section-2__copy">
              Personalizza il layout e scegli il design perfetto per la tua guida digitale, rendendola
              unica e accattivante.
            </p>
          </div>
        </div>
      </section>

      <section className="section-3">
        <div className="section-3__inner hero-typeface">
          <div className="section-3__text">
            <h3 className="section-3__title">
              Tutte le informazioni di cui i tuoi ospiti hanno bisogno, in un solo click
            </h3>
            <p className="section-3__subtitle">
              Crea un homebook su misura per la tua struttura! Aggiungi informazioni sulla casa, regole,
              consigli locali e tanto altro.
            </p>
          </div>
          <div className="section-3__image">
            <Image
              src="/images/parte-1/imm-sezione-3.png"
              alt="Host che lavora al laptop con icone di comunicazione"
              fill
              className="section-3__image-asset"
              sizes="(max-width: 900px) 90vw, 560px"
              priority
            />
          </div>
        </div>
      </section>

      <section className="section-4">
        <div className="section-4__inner hero-typeface">
          <div className="section-4__image">
            <Image
              src="/images/parte-1/imm3-sezione-4.png"
              alt="Illustrazione di un ospite che consulta il suo homebook sul telefono"
              fill
              className="section-4__image-asset"
              sizes="(max-width: 900px) 80vw, 520px"
              priority
            />
          </div>
          <div className="section-4__text">
            <h3 className="section-4__title">
              Niente più stampe, niente più domande: solo ospiti felici!
            </h3>
            <p className="section-4__copy">
              Evita domande ripetitive! Condividi regole, istruzioni e consigli in un unico spazio
              digitale.
            </p>
            <p className="section-4__copy">
              Modifica e aggiorna il tuo homebook in qualsiasi momento, senza bisogno di ristampe o
              PDF statici.
            </p>
          </div>
        </div>
      </section>

      <section className="section-5">
        <div className="section-5__inner hero-typeface">
          <div className="section-5__text">
            <h3 className="section-5__title">
              {"L'ospitalità diventa digitale: semplice, chiaro, efficace!"}
            </h3>
            <p className="section-5__copy">
              Genera un link condivisibile e permetti ai tuoi ospiti di accedere facilmente a tutte le
              informazioni di cui hanno bisogno.
            </p>
            <p className="section-5__copy">
              Risparmia tempo e migliora la comunicazione con i tuoi ospiti con una guida interattiva e
              sempre aggiornata.
            </p>
          </div>
          <div className="section-5__image">
            <Image
              src="/images/parte-1/imm-sezione-5.png"
              alt="Ospite che consulta l'homebook digitale da laptop"
              fill
              className="section-5__image-asset"
              sizes="(max-width: 900px) 94vw, 560px"
              priority
            />
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-section__inner hero-typeface">
          <div className="cta-section__text">
            <span className="pill">Prova gratuita + demo</span>
            <h2 className="cta-section__title">Crea il tuo Homebook in pochi minuti</h2>
            <p className="cta-section__copy">
              Avvia la prova gratuita di 7 giorni o guarda subito un esempio reale in layout Oro per capire
              come apparirà agli ospiti.
            </p>
          </div>
          <div className="cta-section__actions">
            <Link className="btn" href="/register">
              Prova gratis 7 giorni
            </Link>
            <Link className="btn btn-secondary" href="/demo/oro">
              Vedi demo
            </Link>
          </div>
        </div>
      </section>

      <section className="layout-section">
        <div className="layout-section__header hero-typeface">
          <h2 className="layout-section__title">Scegli il layout</h2>
          <p className="layout-section__subtitle">
            Personalizza il tuo Homebook digitale con stile! Sfoglia i layout disponibili, trova quello che si adatta
            meglio alla tua struttura e inizia a raccontare la tua storia! Solo gli host autenticati possono usarli. Gli
            ospiti vedono la versione pubblica protetta.
          </p>
        </div>
        <LayoutCarousel items={LAYOUTS} isAuthenticated={isAuthenticated} />
      </section>
    </div>
  );
}
