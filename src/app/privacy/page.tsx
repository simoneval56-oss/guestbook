import { LegalPageShell } from "../../components/legal-page-shell";
import {
  LEGAL_BRAND_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_PRICE_SUMMARY,
  LEGAL_TRIAL_DAYS,
  buildLegalMetadata
} from "../../lib/legal";

export const metadata = buildLegalMetadata(
  "Informativa privacy",
  "/privacy",
  "Informativa privacy di GuestHomeBook: dati trattati, finalita, abbonamenti e diritti degli utenti."
);

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacy"
      title="Informativa privacy"
      intro={
        <>
          <p style={{ margin: 0 }}>
            Questa informativa descrive come {LEGAL_BRAND_NAME} tratta i dati personali raccolti tramite il sito,
            l&apos;area riservata, il flusso di checkout e il customer portal collegati agli abbonamenti.
          </p>
          <p style={{ margin: 0 }}>
            Il servizio e&apos; rivolto principalmente a host e gestori di strutture ricettive che creano homebook
            digitali per i propri ospiti.
          </p>
        </>
      }
      sections={[
        {
          id: "ruoli",
          title: "Titolare e ambito del trattamento",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Per i dati usati per creare l&apos;account, gestire l&apos;abbonamento, fornire la dashboard e
                rispondere all&apos;assistenza, {LEGAL_BRAND_NAME} opera come titolare del trattamento.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Se inserisci nel servizio contenuti che includono dati personali di terzi, resti responsabile di
                avere una base giuridica adeguata per tale inserimento e di pubblicare solo informazioni necessarie
                e lecite.
              </p>
            </>
          )
        },
        {
          id: "dati",
          title: "Categorie di dati trattati",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Dati account: email, identificativi utente, data di registrazione e stato di accesso.</li>
              <li>
                Dati di servizio: strutture, homebook, sezioni, media caricati, layout scelti e link pubblici
                associati agli homebook.
              </li>
              <li>
                Dati di billing: piano, numero strutture presenti nell&apos;account, stato prova o abbonamento,
                date di trial o scadenza, identificativi cliente e subscription Stripe.
              </li>
              <li>
                Dati tecnici: log applicativi e di sicurezza, indirizzi IP, browser o device data necessari al
                funzionamento, cookie tecnici di sessione, local storage e cache offline usate dal prodotto.
              </li>
              <li>
                Dati di assistenza: contenuto delle richieste inviate a {LEGAL_CONTACT_EMAIL} o tramite altri canali
                di supporto.
              </li>
            </ul>
          )
        },
        {
          id: "finalita",
          title: "Finalita e basi giuridiche",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                Erogazione del servizio, registrazione account, pubblicazione degli homebook e autenticazione:
                esecuzione del contratto o di misure precontrattuali.
              </li>
              <li>
                Gestione della prova gratuita di {LEGAL_TRIAL_DAYS} giorni, del checkout, del customer portal, dei
                webhook Stripe e del riallineamento del piano in base al numero di strutture: esecuzione del
                contratto.
              </li>
              <li>
                Sicurezza, prevenzione abusi, diagnosi errori, backup e continuita operativa: legittimo interesse
                del titolare a mantenere affidabile il servizio.
              </li>
              <li>
                Adempimenti fiscali, contabili, amministrativi o richieste delle autorita: obbligo di legge.
              </li>
            </ul>
          )
        },
        {
          id: "billing",
          title: "Come trattiamo i dati di abbonamento",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Alla registrazione viene attivata una prova gratuita di {LEGAL_TRIAL_DAYS} giorni. Se, al termine
                del trial, non risulta un abbonamento attivo o un override gratuito, la dashboard blocca creazione,
                modifica, pubblicazione e link ospiti.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Il corrispettivo mensile dipende dalla fascia collegata al numero di strutture presenti
                nell&apos;account. Le fasce pubblicate al momento di questo aggiornamento sono:
              </p>
              <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                {LEGAL_PRICE_SUMMARY.map((item) => (
                  <li key={item.label}>
                    {item.label}: {item.value}
                  </li>
                ))}
              </ul>
              <p style={{ margin: "12px 0 0" }}>
                I pagamenti sono gestiti da Stripe su pagine ospitate da Stripe. {LEGAL_BRAND_NAME} non memorizza
                il numero completo della carta o le credenziali di pagamento, ma conserva gli identificativi tecnici
                necessari per associare cliente e subscription al tuo account.
              </p>
            </>
          )
        },
        {
          id: "destinatari",
          title: "Destinatari e trasferimenti",
          body: (
            <>
              <p style={{ margin: 0 }}>
                I dati possono essere trattati, in qualita di responsabili o sub-responsabili, da fornitori
                strettamente necessari al funzionamento del servizio, inclusi provider di hosting e deploy, Supabase
                per autenticazione e database, Stripe per i pagamenti e strumenti di supporto o monitoraggio
                strettamente tecnici.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Se uno di questi fornitori tratta dati fuori dallo SEE, il trattamento avviene con le garanzie
                previste dalla normativa applicabile, incluse clausole contrattuali standard o strumenti equivalenti
                quando richiesti.
              </p>
            </>
          )
        },
        {
          id: "conservazione",
          title: "Conservazione dei dati",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                Dati account e contenuti di servizio: per il tempo necessario a mantenere l&apos;account attivo e,
                successivamente, per il periodo richiesto da esigenze di sicurezza, backup o contestazioni.
              </li>
              <li>
                Dati di billing e documentazione amministrativa: per i termini previsti dalla normativa fiscale e
                civilistica applicabile.
              </li>
              <li>
                Log tecnici e dati diagnostici: per il tempo strettamente necessario a sicurezza, prevenzione abusi e
                debug.
              </li>
            </ul>
          )
        },
        {
          id: "diritti",
          title: "Diritti dell&apos;interessato",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Nei limiti previsti dalla legge puoi chiedere accesso, rettifica, aggiornamento, cancellazione,
                limitazione del trattamento, opposizione o portabilita dei dati scrivendo a {LEGAL_CONTACT_EMAIL}.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Se ritieni che il trattamento violi la normativa applicabile puoi anche proporre reclamo
                all&apos;autorita di controllo competente, incluso il Garante per la protezione dei dati personali.
              </p>
            </>
          )
        }
      ]}
    />
  );
}
