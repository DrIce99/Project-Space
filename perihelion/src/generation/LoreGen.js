import { genName } from '../core/RNG.js';

export const POI_TYPES = {
  monolith: { label: 'Monolite', visSpace: false },
  wreck: { label: 'Relitto', visSpace: false },
  ruin: { label: 'Rovine', visSpace: false },
  signal: { label: 'Sorgente di segnale', visSpace: true },
  geyser: { label: 'Campo geotermico', visSpace: true },
};

const FINDS = {
  monolith: [
    'Una lastra di materiale sconosciuto, fredda quanto il vuoto. Nessuna giunzione, nessuna datazione possibile.',
    'La superficie assorbe ogni frequenza di scansione. Sotto la polvere, incisioni che sembrano orbite.',
  ],
  wreck: [
    'Lo scafo è stato aperto dall\u2019interno. I registri terminano con una sequenza di numeri primi.',
    'Relitto di fattura umana, ma il progetto non compare in nessun archivio. Il reattore è ancora tiepido.',
  ],
  ruin: [
    'Colonne disposte secondo le risonanze orbitali del sistema. Qualcuno le ha allineate con i cicli delle lune.',
    'Strutture erose dal vento. Ogni apertura è orientata verso il punto in cui sorge la stella al solstizio.',
  ],
  signal: [
    'Il segnale si ripete ogni 11 cicli. Non è rumore. Non è naturale.',
    'Una portante pulita, impossibile quaggiù. La modulazione corrisponde al periodo di rotazione del pianeta.',
  ],
  geyser: [
    'Geyser regolari come un respiro. Il vapore contiene catene organiche semplici.',
    'Sfiati termali in attività ciclica. Sotto la crosta c\u2019è qualcosa di caldo e in movimento.',
  ],
};

export function poiText(rng, type){ return FINDS[type][rng.int(0, FINDS[type].length - 1)]; }
export const poiName = rng => genName(rng, 2) + '-' + rng.int(1, 99);

// Capitoli di una lore distribuita: tre "echi" che si riferiscono al sistema reale.
export function echoChapter(idx, ctx){
  return [
    `…abbiamo seguito la risonanza fino a ${ctx.planet}. Il conteggio non torna: dalle carte manca un corpo. Qualcuno lo ha cancellato prima di noi.`,
    `…la frequenza coincide con l'armonica orbitale di ${ctx.star}. Non è una coincidenza: stanno usando le orbite come un orologio.`,
    `…se state leggendo questo, osservate l'allineamento delle lune. Loro sapevano quando guardare. Voi siete arrivati comunque troppo tardi — o troppo presto.`,
  ][idx];
}