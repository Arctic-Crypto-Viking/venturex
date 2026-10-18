import type { Dict } from "./en";

/** Norsk (bokmål). Gjennomgås av grunnleggeren før den første testeren (HANDOFF §10 D10). */
export const nb: Dict = {
  common: {
    beta: "Beta",
    privacy: "Personvern",
    signIn: "Logg inn",
    runTheGates: "Kjør de fem portene — gratis",
    nothingSaved: "Ingenting lagres før du ber om en dom.",
    myVentures: "Mine satsinger",
    feedback: "Tilbakemelding",
    admin: "Admin",
  },
  landing: {
    eyebrow: "For alle med en idé og ingen tid å kaste bort på feil idé",
    title: "Finn ut denne uken om ideen din fortjener de neste 30 dagene dine.",
    body: "Fem dødsporter, en poengsum av 25, ett svar: GO, PARKERT eller DREPT — med begrunnelsen skrevet ned og den ene testen som ville endret den. Ingen mening, ingen smiger, ingen pitch deck.",
    how: {
      eyebrow: "Slik virker det",
      steps: [
        { title: "Beskriv den enkelt", body: "Fem linjer, én hver: ideen, hvem som har problemet, hva de bruker i dag, hva du kan levere på 30 dager, din urettferdige vei til å nå dem." },
        { title: "Fem porter, ett nei dreper", body: "Tretti sekunder hver. Strengere enn entusiasmen din, med vilje: ingen kjøpere du når, ingen som betaler for en dårligere versjon, ingenting salgbart på 30 dager, du leverer hver enhet selv, du vil ikke holde på om 18 måneder." },
        { title: "Gi poeng for det du kan bevise", body: "Bevis på etterspørsel, tid til første euro, prispunkt, distribusjonsfortrinn, margin etter levering. Hvert nivå har en definisjon — velg det du kan forsvare." },
        { title: "Ett svar, én test", body: "18 eller mer er GO, med ukens test og et tall satt på forhånd. 13 til 17 er PARKERT, med utløseren som ville vekket den. Under det, eller et nei i en port, er DREPT — og begrunnelsen står på plass, så den ikke kan komme tilbake uendret." },
      ],
    },
    states: {
      eyebrow: "De tre tilstandene",
      go: { name: "GO", when: "18 eller mer", what: "Et satsingskort og ukens test, med tallet." },
      parked: { name: "PARKERT", when: "13 til 17", what: "Den ene ytre hendelsen som ville vekket den, skrevet ned." },
      killed: { name: "DREPT", when: "Et nei i en port, eller under 13", what: "Porten og begrunnelsen, så den ikke dukker opp igjen om åtte måneder og føles ny." },
    },
    after: {
      eyebrow: "Etter en GO",
      title: "Arbeidsrommet tar den til den første betalende kunden.",
      body: "Åtte trinn som hvert ender i en beslutning: kundeproblemet, markedet, betalingsvilje, tilbudet, det minste salgbare, siden, lanseringen, overleveringen. Én test i uken, med tallet fastsatt før den kjøres. Høyst tre satsinger i gang, og én av dem får timene.",
    },
    footer: { made: "Laget for folk som heller vil vite." },
  },
  home: {
    title: "Mine satsinger",
    empty: "Ingen satsinger ennå.",
    emptyHint: "Kjør en idé gjennom døren; en dom du lagrer blir en satsing her.",
    doorSoon: "Døren åpner med neste byggetrinn.",
    readOnly: "Skrivebeskyttet visning",
  },
  notFound: {
    body: "Her er det ingenting. Ventet du en side, kan du være logget inn med en annen bruker.",
    back: "Tilbake til start",
    signedInAs: "Logget inn som {email}",
    signOut: "Logg ut",
  },
  plans: {
    ventureOne: "1 lagret satsing",
    ventureMany: "{n} lagrede satsinger",
    venturesUnlimited: "Ubegrenset antall lagrede satsinger",
    workspace: "Arbeidsrommet: trinn, antakelser, beslutninger, tester",
    membersOne: "1 invitert person per satsing",
    membersMany: "{n} inviterte personer per satsing",
    weeklyReview: "Mandagsgjennomgangen",
    forecastPublic: "En offentlig prognoselogg",
  },
};
