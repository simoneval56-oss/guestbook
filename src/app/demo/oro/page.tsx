import Link from "next/link";
import { ClassicoEditorPreview } from "../../../components/classico-editor-preview";

const DEMO_CREATED_AT = "2025-01-01T10:00:00Z";

const demoSections = [
  { id: "sec-checkin", title: "Check-in", order_index: 1, visible: true },
  { id: "sec-come-raggiungerci", title: "Come Raggiungerci", order_index: 2, visible: true },
  { id: "sec-struttura", title: "La Nostra Struttura", order_index: 3, visible: true },
  { id: "sec-funzionamento", title: "Funzionamento", order_index: 4, visible: true },
  { id: "sec-regole", title: "Regole Struttura", order_index: 5, visible: true },
  { id: "sec-dove-mangiare", title: "Dove Mangiare", order_index: 6, visible: true },
  { id: "sec-dove-bere", title: "Dove Bere", order_index: 7, visible: true },
  { id: "sec-cosa-visitare", title: "Cosa Visitare", order_index: 8, visible: true },
  { id: "sec-esperienze", title: "Esperienze", order_index: 9, visible: true },
  { id: "sec-shopping", title: "Shopping", order_index: 10, visible: true },
  { id: "sec-spiagge", title: "Spiagge", order_index: 11, visible: true },
  { id: "sec-servizi", title: "Servizi", order_index: 12, visible: true },
  { id: "sec-numeri-utili", title: "Numeri Utili", order_index: 13, visible: true },
  { id: "sec-checkout", title: "Check-out", order_index: 14, visible: true }
];

type DemoSubsection = {
  id: string;
  content_text: string;
  visible: true;
  order_index: number;
  created_at: string;
};

function makeSubsection(id: string, title: string, body: string, orderIndex: number): DemoSubsection {
  return {
    id,
    content_text: JSON.stringify({ title, body }),
    visible: true,
    order_index: orderIndex,
    created_at: DEMO_CREATED_AT
  };
}

const demoSubsections = {
  "sec-checkin": [
    makeSubsection(
      "sub-checkin-prima",
      "Prima di partire",
      "Invia i documenti e conferma l'orario di arrivo almeno 24 ore prima.",
      1
    ),
    makeSubsection(
      "sub-checkin-orario",
      "Orario",
      "Check-in dalle 15:00 alle 20:00. Self check-in su richiesta.",
      2
    ),
    makeSubsection(
      "sub-checkin-self",
      "Self check-in",
      "Riceverai il codice della cassetta il giorno di arrivo.",
      3
    )
  ],
  "sec-come-raggiungerci": [
    makeSubsection(
      "sub-come-auto",
      "Auto",
      "Uscita consigliata: Porto Centro. Parcheggio disponibile in struttura.",
      1
    ),
    makeSubsection(
      "sub-come-treno",
      "Treno",
      "Stazione principale a 15 minuti. Taxi e bus disponibili.",
      2
    )
  ],
  "sec-struttura": [
    makeSubsection(
      "sub-struttura-casa",
      "La casa",
      "Appartamento luminoso con vista mare e accesso indipendente.",
      1
    ),
    makeSubsection(
    "sub-struttura-cucina",
    "Cucina",
    "Cucina attrezzata con forno, microonde e macchina caffè.",
    2
    ),
    makeSubsection(
      "sub-struttura-giardino",
      "Giardino",
      "Spazio esterno con tavolo e sedie per colazioni all'aperto.",
      3
    )
  ],
  "sec-funzionamento": [
    makeSubsection("sub-funzionamento-wifi", "Wi-Fi", "Rete: CasaOro - Password: welcome2025", 1),
    makeSubsection(
      "sub-funzionamento-riscaldamento",
      "Riscaldamento",
      "Termostato in soggiorno. Impostazione consigliata 20-22 gradi.",
      2
    )
  ],
  "sec-regole": [
    makeSubsection("sub-regole-fumo", "Vietato fumare", "Non è consentito fumare negli spazi interni.", 1),
    makeSubsection(
      "sub-regole-silenzio",
      "Silenzio e buon vicinato",
      "Rispetta le ore di riposo dalle 23:00 alle 08:00.",
      2
    )
  ],
  "sec-dove-mangiare": [
    makeSubsection(
      "sub-mangiare-ristorante",
      "Ristorante La Vela",
      "Cucina di pesce a 5 minuti a piedi, consigliata la prenotazione.",
      1
    ),
    makeSubsection("sub-mangiare-pizzeria", "Pizzeria Porto", "Pizze artigianali e opzioni senza glutine.", 2)
  ],
  "sec-dove-bere": [
    makeSubsection(
      "sub-bere-wine",
      "Wine Bar Centro",
      "Selezione vini locali e aperitivi serali.",
      1
    ),
    makeSubsection("sub-bere-cocktail", "Cocktail Beach", "Cocktail al tramonto sulla spiaggia.", 2)
  ],
  "sec-cosa-visitare": [
    makeSubsection("sub-visitare-museo", "Museo del Mare", "Mostra permanente sulla storia del porto.", 1),
    makeSubsection("sub-visitare-belvedere", "Belvedere", "Punto panoramico con vista sull'isola.", 2)
  ],
  "sec-esperienze": [
    makeSubsection("sub-esperienze-barca", "Escursione in barca", "Giro della costa con skipper.", 1),
    makeSubsection("sub-esperienze-bici", "Tour in bici", "Percorso facile lungo la costa.", 2)
  ],
  "sec-shopping": [
    makeSubsection("sub-shopping-mercato", "Mercato locale", "Aperto il sabato mattina.", 1),
    makeSubsection("sub-shopping-boutique", "Boutique Centro", "Artigianato e souvenir.", 2)
  ],
  "sec-spiagge": [
    makeSubsection("sub-spiagge-nord", "Spiaggia Nord", "Sabbia fine e mare basso.", 1),
    makeSubsection("sub-spiagge-sud", "Spiaggia Sud", "Rocce e acqua cristallina.", 2)
  ],
  "sec-servizi": [
    makeSubsection("sub-servizi-farmacia", "Farmacia", "Via Roma 12 - aperta fino alle 20:00.", 1),
    makeSubsection("sub-servizi-supermercato", "Supermercato", "Aperto tutti i giorni 08:00-21:00.", 2)
  ],
  "sec-numeri-utili": [
    makeSubsection("sub-numeri-emergenze", "Emergenze", "Numero unico europeo: 112", 1),
    makeSubsection("sub-numeri-taxi", "Taxi", "+39 0565 000000 - attivo H24", 2)
  ],
  "sec-checkout": [
    makeSubsection("sub-checkout-orario", "Orario", "Check-out entro le 10:00.", 1),
    makeSubsection("sub-checkout-chiavi", "Chiavi", "Lascia le chiavi nel box all'ingresso.", 2)
  ]
};

const demoMediaByParent = {
  "sec-checkin": [
    {
      id: "media-checkin-cover",
      section_id: "sec-checkin",
      url: "/images/parte-1/imm-sezione-1.png",
      type: "image",
      order_index: 1
    }
  ],
  "sub-funzionamento-wifi": [
    {
      id: "media-wifi-link",
      subsection_id: "sub-funzionamento-wifi",
      url: "https://example.com/wifi",
      type: "link",
      description: "Dettagli rete e accesso",
      order_index: 1
    }
  ],
  "sub-regole-fumo": [
    {
      id: "media-regole-file",
      subsection_id: "sub-regole-fumo",
      url: "/demo/regole.txt",
      type: "file",
      description: "Regole complete (allegato)",
      order_index: 1
    }
  ],
  "sub-mangiare-ristorante": [
    {
      id: "media-ristorante-link",
      subsection_id: "sub-mangiare-ristorante",
      url: "https://example.com/menu",
      type: "link",
      description: "Menu e prenotazioni",
      order_index: 1
    }
  ]
};

export default function DemoOroPage() {
  return (
    <div className="public-homebook-wrapper">
      <div className="demo-nav">
        <Link className="btn btn-secondary" href="/">
          Torna alla home
        </Link>
      </div>
      <div className="public-homebook public-homebook--oro oro-editor-page">
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              position: "relative",
              minHeight: 320,
              aspectRatio: "16 / 9",
              background: "linear-gradient(120deg, #e6edef, #dce8ec)",
              borderRadius: "16px 16px 0 0",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center"
              }}
            >
              <div className="demo-placeholder demo-placeholder--cover">Inserire foto copertina</div>
            </div>
          </div>
          <div className="public-homebook-cover__body">
            <span className="pill" style={{ marginBottom: 12 }}>
              Demo Homebook Oro
            </span>
            <h2 className="public-homebook-cover__title demo-placeholder demo-placeholder--text">Inserire nome</h2>
            <div className="public-homebook-cover__meta">
              <p className="public-homebook-cover__address demo-placeholder demo-placeholder--text">
                Inserire indirizzo
              </p>
              <p className="public-homebook-cover__description demo-placeholder demo-placeholder--text">
                Inserire descrizione
              </p>
            </div>
          </div>
        </section>
        <ClassicoEditorPreview
          sections={demoSections}
          subsectionsBySection={demoSubsections}
          mediaByParent={demoMediaByParent}
          layoutName="oro"
          readOnly
          disableLiveMediaFetch
        />
      </div>
    </div>
  );
}
