import { LegalPageShell } from "../../components/legal-page-shell";
import {
  LEGAL_BRAND_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTACT_MAILTO,
  LEGAL_TRIAL_DAYS,
  buildLegalMetadata
} from "../../lib/legal";

export const metadata = buildLegalMetadata(
  "Recesso e cancellazione",
  "/recesso",
  "Informazioni su recesso, cancellazione, rinnovo automatico e rimborsi degli abbonamenti GuestHomeBook."
);

export default function RecessoPage() {
  return (
    <LegalPageShell
      eyebrow="Recesso"
      title="Recesso, cancellazione e rinnovo"
      intro={
        <>
          <p style={{ margin: 0 }}>
            Questa pagina spiega come funziona il recesso per i clienti che acquistano a distanza, come annullare il
            rinnovo automatico e quali sono gli effetti pratici della cessazione dell&apos;abbonamento su
            {LEGAL_BRAND_NAME}.
          </p>
          <p style={{ margin: 0 }}>
            Le informazioni qui sotto si coordinano con i Termini di servizio, con la pagina prezzi e con il flusso
            di checkout o customer portal gestito da Stripe.
          </p>
        </>
      }
      sections={[
        {
          id: "trial",
          title: "Prova gratuita per valutare il servizio",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Prima di qualsiasi addebito, la piattaforma prevede una prova gratuita di {LEGAL_TRIAL_DAYS} giorni.
                Questo periodo serve a testare dashboard, gestione strutture, creazione degli homebook e flusso di
                pubblicazione senza costi.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Se non attivi un abbonamento al termine del trial, l&apos;account resta registrato ma il servizio non
                resta pienamente operativo.
              </p>
            </>
          )
        },
        {
          id: "diritto-recesso",
          title: "Diritto di recesso del consumatore",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Se acquisti come consumatore, puoi esercitare il diritto di recesso entro 14 giorni dalla prima
                attivazione a pagamento del contratto concluso a distanza, salvo i casi di esclusione o limitazione
                previsti dalla legge per i servizi digitali gia&apos; avviati su tua richiesta.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Per esercitare il recesso scrivi da un recapito riconducibile all&apos;account a{" "}
                <a href={LEGAL_CONTACT_MAILTO} style={{ color: "#0e4b58", textDecoration: "underline" }}>
                  {LEGAL_CONTACT_EMAIL}
                </a>
                , indicando almeno email dell&apos;account, data dell&apos;ordine e dichiarazione esplicita di voler
                recedere.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                Se il servizio e&apos; gia&apos; stato richiesto con attivazione immediata, eventuali effetti economici
                del recesso saranno valutati secondo la normativa applicabile e le informazioni rese nel checkout al
                momento della sottoscrizione.
              </p>
            </>
          )
        },
        {
          id: "cancellazione",
          title: "Cancellazione del rinnovo automatico",
          body: (
            <>
              <p style={{ margin: 0 }}>
                L&apos;abbonamento a pagamento ha rinnovo mensile automatico fino a cancellazione. Se l&apos;account ha
                una subscription Stripe attiva, la cancellazione ordinaria del rinnovo si gestisce dal customer portal
                Stripe raggiungibile dalla dashboard.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                In alternativa puoi contattare {LEGAL_CONTACT_EMAIL} chiedendo la cancellazione, fermo restando che i
                tempi tecnici di presa in carico non sostituiscono la gestione self-service quando il portale Stripe
                e&apos; disponibile.
              </p>
            </>
          )
        },
        {
          id: "effetti",
          title: "Effetti di cancellazione, scadenza o mancato rinnovo",
          body: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                La cancellazione del rinnovo blocca gli addebiti futuri, ma di regola consente di usare il servizio
                fino al termine del periodo gia&apos; pagato, salvo diversa indicazione del provider di pagamento.
              </li>
              <li>
                Alla scadenza del periodo attivo, o alla fine del trial senza attivazione, la piattaforma puo&apos;
                bloccare creazione, modifica, pubblicazione e link ospiti.
              </li>
              <li>
                I dati restano soggetti ai tempi di conservazione indicati nella pagina Privacy e possono essere
                cancellati su richiesta nei limiti compatibili con obblighi di legge e sicurezza.
              </li>
            </ul>
          )
        },
        {
          id: "rimborsi",
          title: "Rimborsi",
          body: (
            <>
              <p style={{ margin: 0 }}>
                Salvo obblighi di legge, errori di addebito, duplicazioni o casi valutati espressamente dal supporto,
                non sono previsti rimborsi automatici per frazioni di mese gia&apos; iniziate o per periodi di
                servizio gia&apos; messi a disposizione.
              </p>
              <p style={{ margin: "12px 0 0" }}>
                In presenza di anomalie di fatturazione o contestazioni motivate puoi scrivere a {LEGAL_CONTACT_EMAIL}
                con i dettagli dell&apos;addebito e le verifiche necessarie.
              </p>
            </>
          )
        },
        {
          id: "ambito",
          title: "Clienti professionali e ambito di applicazione",
          body: (
            <p style={{ margin: 0 }}>
              {LEGAL_BRAND_NAME} si rivolge principalmente a host e gestori di strutture ricettive. Le tutele
              specifiche del consumatore, incluso il diritto di recesso entro 14 giorni, si applicano solo quando
              l&apos;acquisto viene effettuato come consumatore e non per finalita professionali o imprenditoriali.
            </p>
          )
        }
      ]}
    />
  );
}
