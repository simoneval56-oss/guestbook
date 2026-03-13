import { LegalPageShell } from "../../components/legal-page-shell";
import { LEGAL_BRAND_NAME, buildLegalMetadata } from "../../lib/legal";

export const metadata = buildLegalMetadata(
  "Cookie policy",
  "/cookie",
  "Cookie policy di GuestHomeBook: cookie tecnici, local storage, cache offline e servizi terzi."
);

export default function CookiePage() {
  return (
    <LegalPageShell
      eyebrow="Cookie"
      title="Cookie policy"
      intro={
        <>
          <p style={{ margin: 0 }}>
            Questa pagina spiega quali cookie e tecnologie analoghe usa {LEGAL_BRAND_NAME} per far funzionare sito,
            autenticazione, dashboard e modalita offline degli homebook pubblici.
          </p>
          <p style={{ margin: 0 }}>
            Alla data di ultimo aggiornamento il servizio usa direttamente solo strumenti tecnici o funzionali e non
            installa cookie pubblicitari o di profilazione proprietari.
          </p>
        </>
      }
      sections={[
        {
          id: "cosa-sono",
          title: "Cosa intendiamo per cookie e tecnologie analoghe",
          body: (
            <p style={{ margin: 0 }}>
              Per cookie e tecnologie analoghe intendiamo cookie HTTP, local storage, cache del browser, service
              worker e strumenti simili usati per mantenere una sessione autenticata, ricordare preferenze
              funzionali e migliorare l&apos;uso del servizio.
            </p>
          )
        },
        {
          id: "tecnici",
          title: "Cookie tecnici indispensabili",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Cookie e token di sessione necessari ad autenticazione, refresh session e sicurezza.</li>
              <li>Cookie server-side necessari a sincronizzare la sessione tra pagine pubbliche e dashboard.</li>
              <li>Cookie strettamente necessari a prevenire accessi non autorizzati e garantire continuita di uso.</li>
            </ul>
          )
        },
        {
          id: "funzionali",
          title: "Storage funzionale, local storage e cache offline",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                Local storage per ricordare se l&apos;utente vuole nascondere alcuni avvisi non bloccanti nella
                dashboard.
              </li>
              <li>
                Local storage e service worker per salvare data dell&apos;ultima sincronizzazione e asset utili alla
                consultazione offline degli homebook pubblici quando il servizio e&apos; attivo.
              </li>
              <li>Cache browser di fogli di stile, script e immagini necessaria alle normali funzioni del sito.</li>
            </ul>
          )
        },
        {
          id: "assenza-profilazione",
          title: "Assenza di cookie marketing proprietari",
          body: (
            <>
              <p style={{ margin: 0 }}>
                {LEGAL_BRAND_NAME} non usa, allo stato attuale del codice applicativo, cookie analytics di terze
                parti, pixel pubblicitari o strumenti di remarketing installati direttamente sulle proprie pagine.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Se in futuro verranno introdotti strumenti non strettamente tecnici, questa policy e gli eventuali
                meccanismi di consenso verranno aggiornati prima dell&apos;attivazione.
              </p>
            </>
          )
        },
        {
          id: "terze-parti",
          title: "Servizi di terze parti collegati al billing",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Quando avvii il checkout o il customer portal vieni reindirizzato a pagine Stripe ospitate da Stripe.
                Su tali pagine possono essere applicati cookie o strumenti tecnici gestiti direttamente dal relativo
                fornitore secondo le sue policy.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                L&apos;uso di quei cookie e&apos; regolato dalle informazioni rese dal servizio terzo nel momento in cui
                lasci il sito di {LEGAL_BRAND_NAME}.
              </p>
            </>
          )
        },
        {
          id: "gestione",
          title: "Come gestire o rimuovere questi strumenti",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Puoi eliminare cookie e dati di navigazione dalle impostazioni del browser.</li>
              <li>
                Puoi disconnetterti dalla dashboard per invalidare la sessione locale e ridurre i dati tecnici
                conservati nel browser.
              </li>
              <li>
                Puoi cancellare dati del sito e cache offline dal browser se non vuoi mantenere la consultazione
                offline degli homebook pubblici.
              </li>
            </ul>
          )
        }
      ]}
    />
  );
}
