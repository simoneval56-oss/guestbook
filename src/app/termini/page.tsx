import Link from "next/link";
import { LegalPageShell } from "../../components/legal-page-shell";
import {
  LEGAL_BRAND_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_PRICE_SUMMARY,
  LEGAL_TRIAL_DAYS,
  buildLegalMetadata
} from "../../lib/legal";

export const metadata = buildLegalMetadata(
  "Termini di servizio",
  "/termini",
  "Termini di servizio di GuestHomeBook: uso della piattaforma, prova gratuita, rinnovo e gestione abbonamenti."
);

export default function TerminiPage() {
  return (
    <LegalPageShell
      eyebrow="Termini"
      title="Termini di servizio"
      intro={
        <>
          <p style={{ margin: 0 }}>
            Questi termini regolano l&apos;uso di {LEGAL_BRAND_NAME}, piattaforma per creare, gestire e condividere
            homebook digitali destinati a strutture ricettive.
          </p>
          <p style={{ margin: 0 }}>
            Usando il sito, creando un account o attivando un abbonamento dichiari di avere il potere di concludere
            un accordo vincolante e di usare il servizio per finalita lecite.
          </p>
        </>
      }
      sections={[
        {
          id: "oggetto",
          title: "Oggetto del servizio",
          body: (
            <p style={{ margin: 0 }}>
              Il servizio consente di creare account, aggiungere strutture, costruire homebook digitali, pubblicarli
              con link condivisibili e gestire layout, contenuti, media e altre funzioni accessorie rese disponibili
              di volta in volta dalla piattaforma.
            </p>
          )
        },
        {
          id: "account",
          title: "Account, credenziali e uso corretto",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Sei responsabile della correttezza dei dati forniti in fase di registrazione.</li>
              <li>
                Devi custodire le credenziali con cura e notificare tempestivamente eventuali accessi non autorizzati.
              </li>
              <li>
                Non puoi usare il servizio per contenuti illeciti, lesivi di diritti altrui, ingannevoli o contrari
                alla normativa applicabile.
              </li>
              <li>
                Resti responsabile dei contenuti pubblicati negli homebook e delle informazioni condivise con gli
                ospiti.
              </li>
            </ul>
          )
        },
        {
          id: "trial",
          title: "Prova gratuita e attivazione del servizio",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Alla creazione dell&apos;account viene attivata una prova gratuita di {LEGAL_TRIAL_DAYS} giorni. Alla
                scadenza del trial il servizio resta pienamente utilizzabile solo se risulta un abbonamento attivo o
                un override gratuito assegnato all&apos;account.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                In assenza di servizio attivo la piattaforma puo&apos; bloccare creazione, modifica, pubblicazione e
                condivisione degli homebook; i link ospiti pubblici associati agli account non attivi possono non
                essere piu&apos; raggiungibili.
              </p>
            </>
          )
        },
        {
          id: "prezzi",
          title: "Piani, prezzi e riallineamento automatico",
          body: (
            <>
              <p style={{ margin: 0 }}>
                I corrispettivi applicabili sono quelli mostrati nella pagina prezzi del sito e confermati nel
                checkout Stripe al momento dell&apos;ordine. Alla data di questo aggiornamento, le fasce pubblicate
                sono:
              </p>
              <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                {LEGAL_PRICE_SUMMARY.map((item) => (
                  <li key={item.label}>
                    {item.label}: {item.value}
                  </li>
                ))}
              </ul>
              <p style={{ margin: "12px 0 0" }}>
                Il piano e il relativo addebito possono essere riallineati automaticamente in base al numero di
                strutture presenti nell&apos;account. L&apos;applicazione effettua questo controllo quando aggiungi o
                rimuovi strutture e tramite processi tecnici di riconciliazione periodica.
              </p>
            </>
          )
        },
        {
          id: "pagamenti",
          title: "Pagamenti, rinnovo e gestione tramite Stripe",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Gli abbonamenti a pagamento sono gestiti tramite Stripe con addebito ricorrente mensile. Il checkout
                puo&apos; consentire codici promozionali quando previsti dal flusso attivo al momento
                dell&apos;acquisto.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Se l&apos;account ha gia&apos; un cliente e una subscription Stripe attivi, il pulsante di gestione puo&apos;
                indirizzare al customer portal Stripe invece di aprire un nuovo checkout. Da quel portale puoi gestire
                metodo di pagamento, rinnovo e cancellazione. Per dettagli operativi consulta anche la pagina{" "}
                <Link href="/recesso" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                  Recesso e cancellazione
                </Link>
                .
              </p>
            </>
          )
        },
        {
          id: "contenuti",
          title: "Contenuti, proprieta intellettuale e responsabilita",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                Mantieni i diritti sui contenuti che carichi o inserisci e concedi a {LEGAL_BRAND_NAME} il diritto
                necessario a ospitarli, processarli e mostrarli per erogare il servizio.
              </li>
              <li>
                Non devi caricare contenuti che violino copyright, privacy, marchi, diritti di immagine o norme di
                settore.
              </li>
              <li>
                {LEGAL_BRAND_NAME} puo&apos; sospendere o limitare l&apos;account in caso di uso illecito, frode, abuso
                tecnico o mancato rispetto di questi termini.
              </li>
            </ul>
          )
        },
        {
          id: "modifiche",
          title: "Disponibilita del servizio e modifiche",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Il servizio e&apos; fornito con ragionevole continuita, ma puo&apos; richiedere manutenzioni,
                aggiornamenti, correzioni o interventi urgenti di sicurezza. Alcune funzioni possono cambiare nel
                tempo.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Eventuali modifiche sostanziali ai prezzi o ai presenti termini si applicheranno ai rinnovi futuri o
                ai nuovi ordini secondo quanto comunicato sul sito, nel checkout o tramite canali di contatto
                disponibili.
              </p>
            </>
          )
        },
        {
          id: "legge",
          title: "Legge applicabile e foro",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Questi termini sono regolati dalla legge italiana, fatti salvi i diritti inderogabili eventualmente
                riconosciuti al consumatore dalla normativa applicabile.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Se acquisti come consumatore, per le controversie resta fermo il foro del tuo luogo di residenza o
                domicilio nei casi previsti dalla legge. Per richieste preliminari o tentativi di composizione puoi
                scrivere a {LEGAL_CONTACT_EMAIL}.
              </p>
            </>
          )
        }
      ]}
    />
  );
}
