// Fixtures compactos a partir de respuestas reales de MusicBrainz (capturadas el
// 5-11-2026). Genera test/fixtures.json con la forma que espera e2e.mjs.
import { writeFileSync } from 'node:fs';

const AREA = {
  uk: { id: '8a754a16-0027-3a29-b6d7-2b40ea0481ed', name: 'United Kingdom', 'iso-3166-1-codes': ['GB'] },
  de: { id: '85752fda-13c4-31a3-bee5-0e5cb1f51dad', name: 'Germany', 'iso-3166-1-codes': ['DE'] },
  us: { id: '489ce91b-6658-3307-9877-795b68554c98', name: 'United States', 'iso-3166-1-codes': ['US'] },
  es: { id: '471c46a7-afc5-31c4-923c-d0444f5053a4', name: 'Spain', 'iso-3166-1-codes': ['ES'] },
  co: { id: '02b60d8d-7164-339d-868d-22d147d9f74a', name: 'Colombia', 'iso-3166-1-codes': ['CO'] },
  london: { id: 'f03d09b3-39dc-4083-afd6-159e3f0d462f', name: 'London' },
  bristol: { id: '40d758a4-b7c2-40f3-b439-5efbd2a3b038', name: 'Bristol' },
  salford: { id: 'f61848ab-0ba0-4534-8b71-d9c7c03e854c', name: 'Salford' },
  edinburgh: { id: '6658f787-692d-417f-852c-dcca728d5849', name: 'Edinburgh' },
  dusseldorf: { id: '03e75281-c3a3-454a-8d78-c85a5415c49e', name: 'Düsseldorf' },
  berlin: { id: 'c9ac1239-e832-41bc-9930-e252a1fd1105', name: 'Berlin' },
  granada: { id: '66ae1ad4-d9df-4213-9447-14eb1298700d', name: 'Granada' },
  hamburg: { id: '11a44e18-a2e5-43a9-bee9-aa4f7c83f967', name: 'Hamburg' },
  detroit: { id: 'b03ff310-d8e2-45cf-9455-769f76641eb2', name: 'Detroit' },
  littlerock: { id: '9150ffc9-be86-42ff-96b6-a4fee1ce2b52', name: 'Little Rock' },
  santcugat: { id: '4ec297ff-610d-4da2-a173-f8137e66a52d', name: 'Sant Cugat del Vallès' },
  limerick: { id: '1063266a-afe6-4fb3-ab51-0d290a79f979', name: 'Limerick' },
};
const LBL = {
  warp: ['46f0f4cd-8aab-4b33-b698-f459faf64190', 'Warp'],
  impulse: ['93c3b044-2b4e-4239-a73b-8fb76f3e6ca9', 'impulse!'],
  factory: ['a2faf590-58fc-4e9f-a85b-eaf6dc266317', 'Factory'],
  factory2: ['1ad5ee08-20db-44c3-b5f9-0f602f2bc0a7', 'Factory'],
  qwest: ['279669fd-fcd3-4d68-afa2-786b96e55de4', 'Qwest Records'],
  roughtrade: ['71247f6b-fd24-4a56-89a2-23512f006f0c', 'Rough Trade'],
  beat: ['ea424c04-1edd-4ce4-8b3b-8181571ccaa3', 'Beat Records'],
  basicchannel: ['fbcc6cee-ea6c-42a8-821f-74c3b54c26cc', 'Basic Channel'],
  columbia: ['011d1192-6f65-45bd-85c4-0400dd45693e', 'Columbia'],
  warner: ['c595c289-47ce-4fba-b999-b87503e8cb71', 'Warner Bros. Records'],
  grp: ['687726bf-86aa-442e-bcad-6f0ca5e6dcc7', 'GRP'],
  sony: ['9e6b4d7f-4958-4db7-8504-d89e315836af', 'Sony Music'],
  polydor: ['ce24ab18-1bd6-4293-a486-546d13d6a5e2', 'Polydor'],
  virgin: ['49b58bdb-3d74-40c6-956a-4c4b46115c9c', 'Virgin'],
  island: ['dfd92cd3-4888-46d2-b968-328b1feb2642', 'Island'],
  londonrec: ['60a0dd34-2333-4679-9050-38c21f7bc616', 'London Records'],
  noLabel: ['157afde4-4bf5-4039-8ad2-5a15acc85176', '[no label]'],
};
const lab = (k, n) => ({ id: LBL[k]?.[0] ?? `x-${k}`, name: LBL[k]?.[1] ?? k, n });
const other = (id, name, n) => ({ id, name, n });

const S = (id, name, type, score, country, area, dis, begin, tags = []) => ({
  id, name, type, score, country, area: area ? { name: area } : null, disambiguation: dis, 'life-span': begin ? { begin } : {},
  tags: tags.map(([n, c]) => ({ name: n, count: c })),
});
const SL = (id, name, type, score, country, dis) => ({ id, name, type, score, country, disambiguation: dis });
const g = (str) => str.split(',').map((x) => { const [n, c] = x.split(':'); return { name: n.trim(), count: +c }; });
const member = (dir, id, name, ended) => ({ type: 'member of band', direction: dir, 'target-type': 'artist', ...(ended ? { ended: true } : {}), artist: { id, name } });
const arel = (type, dir, id, name) => ({ type, direction: dir, 'target-type': 'artist', artist: { id, name } });
const lrel = (type, k) => ({ type, direction: 'forward', 'target-type': 'label', label: { id: LBL[k]?.[0] ?? k, name: LBL[k]?.[1] ?? k } });
const lrelX = (type, id, name) => ({ type, direction: 'forward', 'target-type': 'label', label: { id, name } });
const url = (type, resource) => ({ type, direction: 'forward', 'target-type': 'url', url: { resource } });

const artist = (o) => ({
  id: o.id, name: o.name, 'sort-name': o.name, type: o.type, country: o.country, area: o.area, 'begin-area': o.beginArea ?? null,
  disambiguation: o.dis ?? '', 'life-span': { begin: o.begin ?? null, end: o.end ?? null, ended: !!o.end },
  genres: g(o.genres), tags: g(o.tags ?? o.genres), relations: o.rels ?? [],
});

const BERNARD = ['6fa2e161-200e-475a-8492-3755594581f9', 'Bernard Sumner'];
const HOOK = ['73e7c483-9f3e-4a72-a359-582452fbaeac', 'Peter Hook'];
const MORRIS = ['b3036249-8b39-4d02-a312-d31a63497bbc', 'Stephen Morris'];

const fx = {
  'Aphex Twin': {
    artists: [
      S('f22942a1-6f70-4f48-866e-238cb2308fbd', 'Aphex Twin', 'Person', 100, undefined, 'London', undefined, '1971-08-18', [['electronic', 34], ['idm', 29]]),
      S('65016d2c-b183-405b-91a4-275e6b7b5600', 'Aphex Twin', 'Person', 68, undefined, null, 'UK experimental electronic artist', '2010-11-27'),
      S('1f7b4d15-cf9b-403e-bab8-87fc99aa08ef', 'Aphex Twin', undefined, 68, undefined, null, 'appears on a KUSOMEN release'),
    ],
    labels: [SL('6b1b5121-26db-4582-98c4-9ab37eab1d2f', 'Aphex Recordings', 'Production', 100, 'GB')],
    lookup: artist({
      id: 'f22942a1-6f70-4f48-866e-238cb2308fbd', name: 'Aphex Twin', type: 'Person', country: 'GB', area: AREA.london, beginArea: AREA.limerick, begin: '1971-08-18',
      genres: 'acid breaks:5,acid techno:6,ambient:25,ambient techno:16,breakbeat:2,drill and bass:8,electroacoustic:3,electronic:34,electronica:7,experimental:22,idm:29,techno:7,pop:1,house:1',
      tags: 'electronic:34,idm:29,ambient:25,experimental:22,ambient techno:16,drill and bass:8,electronica:7,techno:7,acid techno:6,british:5',
      rels: [arel('is person', 'backward', '79a09151-f6cc-48f9-9907-3fdd0b68373f', 'Richard D. James'), lrel('recording contract', 'warp'),
        url('bandcamp', 'https://aphextwin.bandcamp.com/'), url('discogs', 'https://www.discogs.com/artist/45'), url('free streaming', 'https://open.spotify.com/artist/6kBDZFXuLrZgHnvmPu9NsG'),
        url('soundcloud', 'https://soundcloud.com/aphex-twin-official'), url('wikidata', 'https://www.wikidata.org/wiki/Q223161'), url('youtube', 'https://www.youtube.com/channel/UC4hfA78X-lqiRERBZLTnLBw')],
    }),
    releases: { years: [1991, 1995, 1999, 2004, 2005], labels: [lab('warp', 53), other('be0fec81-5c18-4494-8bbf-0d81dec006bf', 'Sire Records', 20), other('77bc13d5-ad62-4a2a-afd8-7e184f090708', 'R&S Records', 10), lab('roughtrade', 5)] },
  },
  'Boards of Canada': {
    artists: [
      S('69158f97-4c07-4c4e-baf8-4e4ab1ed666e', 'Boards of Canada', 'Group', 100, 'GB', 'United Kingdom', 'Scottish electronic duo', '1986', [['electronic', 24], ['idm', 24]]),
      S('3ab0c8c5-89f2-420a-a2fa-262acdd6a18c', 'Boards of Canada', undefined, 93, undefined, null, 'for fake releases and mistagged recordings'),
    ],
    labels: [SL('8f638ddb-131a-4cc3-b3d4-7ebdac201b55', 'Epic', 'Imprint', 100, 'US')],
    lookup: artist({
      id: '69158f97-4c07-4c4e-baf8-4e4ab1ed666e', name: 'Boards of Canada', type: 'Group', country: 'GB', area: AREA.uk, beginArea: AREA.edinburgh, begin: '1986', dis: 'Scottish electronic duo',
      genres: 'ambient:21,ambient techno:4,downtempo:16,electronic:24,folktronica:5,hauntology:11,idm:24,trip hop:3',
      tags: 'electronic:24,idm:24,ambient:21,downtempo:16,hauntology:11,british:8,warp:8,folktronica:5,ambient techno:4,trip hop:3',
      rels: [member('backward', '74edfdf2-4e76-4031-ae9b-16f1c7b4ba06', 'Marcus Eoin'), member('backward', 'd35d0684-42bd-4344-b8a4-f18eb806801a', 'Michael Sandison'),
        lrelX('label founder', '8d76f11c-1287-4ab5-af6d-faa5bd21849f', 'Music70'), lrel('recording contract', 'warp'),
        url('bandcamp', 'https://boardsofcanada.bandcamp.com/'), url('free streaming', 'https://open.spotify.com/artist/2VAvhf61GgLYmC6C8anyX1'), url('official homepage', 'http://www.boardsofcanada.com/')],
    }),
    releases: { years: [1995, 2000, 2006, 2014, 2026], labels: [lab('warp', 67), other('8d76f11c-1287-4ab5-af6d-faa5bd21849f', 'Music70', 24), other('5c5bc5b7-13a7-49c7-935c-4ec9686d9cae', 'Skam', 18), lab('beat', 8)] },
  },
  'Warp Records': {
    artists: [S('21eb2468-3976-4a4b-8c5a-fa01fc3e5d13', 'Warp Brothers', 'Group', 100, 'DE', 'Germany', undefined, '1999', [['hard trance', 2]])],
    labels: [
      SL('2cb2c4ce-38de-4d05-8953-447ab73a2c62', 'Warp Records', 'Original Production', 100, undefined, 'record company, use “Warp” for imprints'),
      SL('0bf864f5-82c3-42ed-afe3-f43be3447fa2', 'Warp Records Limited', 'Holding', 82),
      SL('19bf5b70-d5cb-43c4-b3e2-d37d1b501bdd', 'Warp Records', undefined, 68),
    ],
    lookup: { id: '2cb2c4ce-38de-4d05-8953-447ab73a2c62', name: 'Warp Records', type: 'Original Production', country: null, area: null, disambiguation: 'record company, use “Warp” for imprints', 'life-span': {}, genres: [], tags: [{ name: 'distributor', count: 1 }], relations: [] },
  },
  'Basic Channel': {
    artists: [S('d145a57e-7afb-4793-8cc4-2fad292374ef', 'Basic Channel', 'Group', 100, 'DE', 'Germany', undefined, '1993', [['ambient techno', 2], ['dub techno', 2]])],
    labels: [SL('fbcc6cee-ea6c-42a8-821f-74c3b54c26cc', 'Basic Channel', 'Original Production', 100, 'DE')],
    lookup: artist({
      id: 'd145a57e-7afb-4793-8cc4-2fad292374ef', name: 'Basic Channel', type: 'Group', country: 'DE', area: AREA.de, beginArea: AREA.berlin, begin: '1993',
      genres: 'acid techno:1,ambient dub:1,ambient techno:2,dub techno:2,electronic:1,minimal techno:1',
      rels: [member('backward', '6fb800e6-65db-4368-8472-b125e185f823', 'Mark Ernestus'), member('backward', '48c4ea31-fe9d-4bbf-8a1c-a2996abcfb9f', 'Moritz von Oswald'),
        url('free streaming', 'https://open.spotify.com/artist/37um1uxI92g4ll61LzrtB5'), url('official homepage', 'http://www.basicchannel.com/')],
    }),
    releases: { years: [1993, 2003, 2014], labels: [lab('basicchannel', 31)] },
  },
  'Moritz von Oswald': {
    artists: [
      S('48c4ea31-fe9d-4bbf-8a1c-a2996abcfb9f', 'Moritz von Oswald', 'Person', 100, 'DE', 'Germany', undefined, '1962', [['techno', 1]]),
      S('2ff03769-b92e-493e-bf42-640cb6df0e99', 'Moritz von Oswald Trio', 'Group', 87),
    ],
    labels: [],
    lookup: artist({
      id: '48c4ea31-fe9d-4bbf-8a1c-a2996abcfb9f', name: 'Moritz von Oswald', type: 'Person', country: 'DE', area: AREA.de, beginArea: AREA.hamburg, begin: '1962',
      genres: 'dub techno:1,electronic:1,techno:1', tags: 'dub techno:1,electronic:1,producer:1,techno:1',
      rels: [member('forward', 'c2faf89f-078a-4b52-abd3-65583429c096', 'Palais Schaumburg', true), member('forward', '2ff03769-b92e-493e-bf42-640cb6df0e99', 'Moritz von Oswald Trio'),
        member('forward', '0bf220da-eb15-4bf2-9460-f640aaeda272', 'Rhythm & Sound'), member('forward', 'd145a57e-7afb-4793-8cc4-2fad292374ef', 'Basic Channel'),
        lrel('label founder', 'basicchannel'), lrelX('label founder', '04ac00ca-847b-4d1c-8ea6-85cd7719e946', 'Chain Reaction'),
        url('free streaming', 'https://open.spotify.com/artist/33GGoMV3iYpV5tlsh32N7q')],
    }),
    releases: { years: [2008, 2020, 2023], labels: [other('888875e6-a416-494c-91fe-0cf35295f34f', 'Tresor', 7), other('5a584032-dcef-41bb-9f8b-19540116fb1c', 'Deutsche Grammophon', 2), other('19d052fa-570a-4b17-9a3d-8f2f029b7b57', 'Universal Music Group', 1)] },
  },
  Burial: {
    artists: [
      S('b068d41f-855d-4426-9ff7-f79b094441ff', 'The Burial', 'Group', 100, 'GB', 'United Kingdom', 'UK oi/ska band', undefined, [['oi', 2]]),
      S('9ddce51c-2b75-4b3e-ac8c-1db09e7c89c6', 'Burial', 'Person', 82, 'GB', 'United Kingdom', 'UK dubstep', '1979-08', [['future garage', 15], ['dubstep', 14]]),
      S('a2570abc-9231-426e-967e-b3d7f10a9410', 'Burial', 'Group', 77, undefined, 'Manchester', 'UK / Black/Death Metal', '2005', [['black metal', 2]]),
    ],
    labels: [SL('0d869fd4-73d4-43bd-94ea-4af20d6f322e', 'Burial Mix', 'Original Production', 99, 'DE')],
    lookup: artist({
      id: '9ddce51c-2b75-4b3e-ac8c-1db09e7c89c6', name: 'Burial', type: 'Person', country: 'GB', area: AREA.uk, beginArea: AREA.london, begin: '1979-08', dis: 'UK dubstep',
      genres: '2-step:4,ambient:7,black metal:1,death metal:1,dub:1,dubstep:14,electronic:6,future garage:15,grime:1,uk garage:3,witch house:1,shoegaze:1',
      tags: 'future garage:15,dubstep:14,ambient:7,electronic:6,2-step:4,british:3,uk garage:3,london:2,uk:2,black metal:1',
      rels: [member('forward', '5bfb8b9a-84d3-4f03-98c3-8da590049cb0', 'Flame 1'), url('discogs', 'https://www.discogs.com/artist/1975486'), url('bandcamp', 'https://burial.bandcamp.com/'), url('free streaming', 'https://open.spotify.com/artist/0uCCBpmg6MrPb1KY2msceF')],
    }),
    releases: { years: [2005, 2009, 2014, 2018, 2022, 2023], labels: [other('d73fd0e0-8799-4506-ad1b-6342bf46fc77', 'Hyperdub', 70), other('010d5e54-d447-45c5-b9e3-3e17927530e2', 'Keysound Recordings', 6), lab('beat', 5), lab('noLabel', 4)] },
  },
  Portishead: {
    artists: [S('8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11', 'Portishead', 'Group', 100, 'GB', 'United Kingdom', undefined, '1991', [['trip hop', 16], ['electronic', 8]])],
    labels: [],
    lookup: artist({
      id: '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11', name: 'Portishead', type: 'Group', country: 'GB', area: AREA.uk, beginArea: AREA.bristol, begin: '1991',
      genres: 'downtempo:7,electronic:8,experimental rock:4,folktronica:1,trip hop:16', tags: 'trip hop:16,electronic:8,downtempo:7,trip-hop:6,experimental rock:4,bristol sound:1',
      rels: [member('backward', '5082a11f-7203-4ff3-ae04-2a0150d3bbb6', 'Geoff Barrow'), member('backward', '5adcb9d9-5ea2-428d-af46-ef626966e106', 'Beth Gibbons'), member('backward', '619b1116-740e-42e0-bdfe-96af274f79f7', 'Adrian Utley'),
        url('free streaming', 'https://open.spotify.com/artist/6liAMWkVf5LH7YR9yfFy1Y')],
    }),
    releases: { years: [1994, 1999, 2010, 2011], labels: [other('cd275ac6-9af0-4465-895b-462208cb716e', 'Go! Beat', 55), lab('island', 12), other('d348ac6f-0fb1-4d28-b95c-814eb9ad17ef', 'Go! Discs', 11), lab('polydor', 5)] },
  },
  'Massive Attack': {
    artists: [S('10adbe5e-a2c0-4bf3-8249-2b4cbf6e6ca8', 'Massive Attack', 'Group', 100, 'GB', 'United Kingdom', undefined, '1987', [['trip hop', 23], ['electronic', 18]])],
    labels: [SL('bed52e0d-3db9-4d96-a90c-24f034472576', 'Massive Attack Records', undefined, 100, 'GB')],
    lookup: artist({
      id: '10adbe5e-a2c0-4bf3-8249-2b4cbf6e6ca8', name: 'Massive Attack', type: 'Group', country: 'GB', area: AREA.uk, beginArea: AREA.bristol, begin: '1987',
      genres: 'alternative dance:2,ambient:7,downtempo:12,dub:6,electronic:18,hip hop:1,trip hop:23,techno:1,uk street soul:1',
      tags: 'trip hop:23,electronic:18,downtempo:12,ambient:7,dub:6,british:5,trip-hop:5,spotify boycott:2',
      rels: [member('backward', '5bf64d94-efd9-4334-96fd-e6197b0b02b8', 'Tricky', true), member('backward', '57070ee8-e44c-48c7-9519-6c985adfe6b2', 'Daddy G'), member('backward', 'f6564fc9-488d-47e8-9406-69c25fd75c16', '3D'),
        arel('instrumental supporting musician', 'backward', 'ebd7e97d-ea86-42d8-98ee-9d7f243f9030', 'Damon Reece')],
    }),
    releases: { years: [1988, 1994, 1998], labels: [other('b757080f-b10d-49dd-9d7d-ae723112710a', 'Wild Bunch Records', 62), other('2df11336-aca7-460e-8c2a-02ae67508ddf', 'Circa Records', 35), lab('virgin', 19), other('7d205322-a078-49e5-a1dc-7f90017cbb92', 'Virgin Schallplatten GmbH', 1)] },
  },
  'Joy Division': {
    artists: [S('9a58fda3-f4ed-4080-a3a5-f457aac9fcdd', 'Joy Division', 'Group', 100, 'GB', 'United Kingdom', 'English post-punk band', '1978-01', [['post-punk', 24], ['new wave', 7]])],
    labels: [SL('ce24ab18-1bd6-4293-a486-546d13d6a5e2', 'Polydor', 'Imprint', 41, 'GB')],
    lookup: artist({
      id: '9a58fda3-f4ed-4080-a3a5-f457aac9fcdd', name: 'Joy Division', type: 'Group', country: 'GB', area: AREA.uk, beginArea: AREA.salford, begin: '1978-01', end: '1980-05', dis: 'English post-punk band',
      genres: 'gothic rock:5,new wave:7,post-punk:24,rock:1',
      rels: [member('backward', '10ae1bf6-88b2-4fb4-8fbe-8227a49803d3', 'Ian Curtis', true), member('backward', ...HOOK, true), member('backward', ...MORRIS, true), member('backward', ...BERNARD, true),
        arel('subgroup', 'backward', 'f1106b17-dcbb-45f6-b938-199ccfab50cc', 'New Order'), url('free streaming', 'https://open.spotify.com/artist/432R46LaYsJZV2Gmc4jUV5')],
    }),
    releases: { years: [1978, 1983, 1987, 1991, 1995], labels: [lab('factory', 56), other('0c49508e-abff-49ad-b87c-da6270589ae3', 'Strange Fruit', 7), lab('qwest', 7), lab('polydor', 4)] },
  },
  'New Order': {
    artists: [
      S('f1106b17-dcbb-45f6-b938-199ccfab50cc', 'New Order', 'Group', 100, 'GB', 'United Kingdom', 'UK synth pop band', '1980', [['new wave', 20], ['post-punk', 14]]),
      S('790d1e50-5416-454d-abc2-63fe4db16063', 'New Order', undefined, 69, undefined, null, 'cover band? no relation to UK band'),
    ],
    labels: [],
    lookup: artist({
      id: 'f1106b17-dcbb-45f6-b938-199ccfab50cc', name: 'New Order', type: 'Group', country: 'GB', area: AREA.uk, beginArea: AREA.salford, begin: '1980', dis: 'UK synth pop band',
      genres: 'alternative dance:10,alternative rock:7,electronic:12,new wave:20,post-punk:14,synth-pop:9,house:1',
      tags: 'new wave:20,post-punk:14,electronic:12,alternative dance:10,synth-pop:9,synthpop:8,alternative rock:7,british:4',
      rels: [arel('collaboration', 'forward', 'ef96a7c5-cfe5-43e0-a65f-0262e7f44630', '1,000 UK Artists'), member('backward', 'c970c5cd-facf-4c49-babf-a5b688c1ec40', 'Gillian Gilbert'),
        member('backward', ...HOOK, true), member('backward', ...MORRIS), member('backward', ...BERNARD), arel('subgroup', 'forward', '9a58fda3-f4ed-4080-a3a5-f457aac9fcdd', 'Joy Division'),
        url('free streaming', 'https://open.spotify.com/artist/0yNLKJebCb8Aueb54LYya3'), url('bandcamp', 'https://neworder.bandcamp.com/')],
    }),
    releases: { years: [1981, 1985, 1988], labels: [lab('factory', 66), lab('qwest', 20), lab('roughtrade', 3), lab('factory2', 3)] },
  },
  'Factory Records': {
    artists: [S('89ad4ac3-39f7-470e-963a-56509c546377', 'Various Artists', 'Other', 100, undefined, null, 'add compilations to this artist')],
    labels: [
      SL('5cc199a8-b722-4bda-bfae-d01efd1bd692', 'Music Factory Records Limited', undefined, 100),
      SL('a2faf590-58fc-4e9f-a85b-eaf6dc266317', 'Factory', 'Original Production', 94, 'GB'),
      SL('7592133a-0386-43b1-9880-bc48ccbf06a4', 'Factory Records', undefined, 90, 'CO', 'Columbian label, not the Mancunian one'),
    ],
    lookups: {
      'a2faf590-58fc-4e9f-a85b-eaf6dc266317': { id: 'a2faf590-58fc-4e9f-a85b-eaf6dc266317', name: 'Factory', type: 'Original Production', country: 'GB', area: { id: 'manchester', name: 'Manchester' }, disambiguation: '', 'life-span': { begin: '1978', end: '1992' }, genres: [], tags: [], relations: [] },
      '7592133a-0386-43b1-9880-bc48ccbf06a4': { id: '7592133a-0386-43b1-9880-bc48ccbf06a4', name: 'Factory Records', type: null, country: 'CO', area: AREA.co, disambiguation: 'Columbian label, not the Mancunian one', 'life-span': {}, genres: [], tags: [], relations: [] },
    },
  },
  Kraftwerk: {
    artists: [S('5700dcd4-c139-4f31-aa3e-6382b9af9032', 'Kraftwerk', 'Group', 100, 'DE', 'Germany', undefined, '1970', [['electronic', 18], ['krautrock', 11]])],
    labels: [SL('0e7c1fab-4cf9-4c92-98a1-e697e7bf7026', 'Plonk', undefined, 100)],
    lookup: artist({
      id: '5700dcd4-c139-4f31-aa3e-6382b9af9032', name: 'Kraftwerk', type: 'Group', country: 'DE', area: AREA.de, beginArea: AREA.dusseldorf, begin: '1970',
      genres: 'electro:7,electronic:18,krautrock:11,progressive electronic:3,synth-pop:11,techno:5',
      tags: 'electronic:18,krautrock:11,synth-pop:11,german:8,electro:7,techno:5,synthpop:4,progressive electronic:3',
      rels: [member('backward', 'da3f4766-628e-4da3-a871-014728993157', 'Ralf Hütter'), member('backward', 'da3f4766-628e-4da3-a871-014728993157', 'Ralf Hütter'), member('backward', '46957dac-b5ff-40a9-a427-ab53bc414f6e', 'Florian Schneider', true),
        member('backward', '3b4db0d5-97a8-4aa8-a375-9b8c78a56932', 'Michael Rother', true), member('backward', '34bfcd5d-a76d-4b31-8022-b5ac04d5801b', 'Karl Bartos', true),
        lrelX('label founder', '3b786545-a60f-4e2e-b1f3-6d5ca7102013', 'Kling Klang Music'), url('free streaming', 'https://open.spotify.com/artist/0dmPX6ovclgOy8WWJaFEUU')],
    }),
    releases: { years: [1970, 1975, 1979, 1984, 1986], labels: [other('abea2d3e-eabf-4480-ab24-9382dd642c73', 'Capitol Records', 23), other('c029628b-6633-439e-bcee-ed02e8a338f7', 'EMI', 19), other('142df2b2-07ea-43bd-9df9-4a2627ec6bb5', 'Kling Klang', 17), other('1b3b52a5-ef89-4f8b-8d5f-e15a7a58863b', 'Vertigo', 12), other('6d38d6d2-bea8-46cf-b48e-a6195fd85f12', 'Philips', 11), lab('warner', 7)] },
  },
  'Alice Coltrane': {
    artists: [
      S('d24fc285-7b2f-47da-8ac5-4070b08570b1', 'Alice Coltrane', 'Person', 100, 'US', 'United States', undefined, '1937-08-27', [['jazz', 2], ['spiritual jazz', 2]]),
      S('b625448e-bf4a-41c3-a421-72ad46cdb831', 'John Coltrane', 'Person', 37, 'US', 'United States', undefined, '1926-09-23', [['jazz', 19]]),
    ],
    labels: [SL('3a14ff80-1942-4aea-9e0f-c3a097760550', 'Coltrane Records', 'Production', 95)],
    lookup: artist({
      id: 'd24fc285-7b2f-47da-8ac5-4070b08570b1', name: 'Alice Coltrane', type: 'Person', country: 'US', area: AREA.us, beginArea: AREA.detroit, begin: '1937-08-27', end: '2007-01-12',
      genres: 'avant-garde jazz:1,free jazz:1,jazz:2,jazz fusion:1,new age:1,spiritual jazz:2,third stream:1',
      tags: 'jazz:2,spiritual jazz:2,avant-garde jazz:1,free jazz:1,jazz fusion:1,jazz musicians:1,klavier:1,new age:1,pianists:1,synthesizer:1',
      rels: [arel('married', 'forward', 'b625448e-bf4a-41c3-a421-72ad46cdb831', 'John Coltrane'), member('backward', '1f0cdc02-c8d5-4228-8227-37ec0c289b48', 'Charlie Haden'),
        arel('parent', 'forward', 'c14149eb-877d-460d-9d84-459dd14a3206', 'Ravi Coltrane'), url('bandcamp', 'https://alicecoltrane.bandcamp.com/'), url('discogs', 'https://www.discogs.com/artist/3021135'), url('free streaming', 'https://open.spotify.com/artist/0oKYiTD5CdNbrofRvM1dIr')],
    }),
    releases: { years: [1963, 1971, 1976, 1982, 1996, 2001, 2005, 2009, 2017], labels: [lab('impulse', 46), lab('warner', 8), other('b960d985-d776-4246-9bda-819a2edff48c', 'Avatar Book Institute', 6), other('d633e4af-9c3d-4cd6-996c-ba4f96706f5a', 'Milestone', 6), lab('columbia', 4), lab('grp', 4)] },
  },
  'Pharoah Sanders': {
    artists: [
      S('b3a0912a-a62a-4388-9368-7cb21ed5caf9', 'Pharoah Sanders', 'Person', 100, 'US', 'United States', 'US jazz saxophonist', '1940-10-13', [['jazz', 7], ['avant-garde jazz', 5]]),
      S('c0bf3151-d1bf-4ae7-9c9d-df87bb90d1be', 'Pharoah Sanders Quartet', 'Group', 81),
    ],
    labels: [SL('4fbc29d7-8e06-4aec-9411-7993fd3344e4', 'Pharoah Sanders Music', 'Publisher', 100, 'US')],
    lookup: artist({
      id: 'b3a0912a-a62a-4388-9368-7cb21ed5caf9', name: 'Pharoah Sanders', type: 'Person', country: 'US', area: AREA.us, beginArea: AREA.littlerock, begin: '1940-10-13', end: '2022-09-24', dis: 'US jazz saxophonist',
      genres: 'avant-garde jazz:5,blues:1,cool jazz:1,free jazz:4,gnawa:1,hard bop:2,jazz:7,post-bop:1,soul jazz:1,spiritual jazz:3',
      tags: 'jazz:7,avant-garde jazz:5,free jazz:4,spiritual jazz:3,hard bop:2,2008 universal fire victim:1,blues:1',
      rels: [arel('is person', 'forward', '3d52841f-ebb7-4108-b93b-e49d5a6adebc', 'Little Rock'), member('forward', 'c0bf3151-d1bf-4ae7-9c9d-df87bb90d1be', 'Pharoah Sanders Quartet'),
        url('bandcamp', 'https://pharoahsanders.bandcamp.com/'), url('free streaming', 'https://open.spotify.com/artist/3JLUCojZaHrX2LaUkSj7Ud')],
    }),
    releases: { years: [1965, 1971, 1976, 1982, 1987, 1991, 1995, 1999, 2004, 2005], labels: [lab('impulse', 39), other('9909535b-db9e-4515-a6c4-951bba622261', 'Theresa Records', 12), other('20973134-46d0-4b99-811b-3a41b94aee93', 'Timeless Records', 8), other('7938563f-f10a-444d-9475-e24741fbc2cc', 'Evidence', 7), lab('grp', 3)] },
  },
  'Los Planetas': {
    artists: [S('6f28b158-4d1a-4f31-9339-7f381e3c4ee1', 'Los Planetas', 'Group', 100, 'ES', 'Spain', undefined, '1993', [['indie rock', 4], ['shoegaze', 1]])],
    labels: [SL('134480c8-89f4-4e90-a80d-2d72952ae331', 'Planétás Kiadó', 'Publisher', 100, 'HU')],
    lookup: artist({
      id: '6f28b158-4d1a-4f31-9339-7f381e3c4ee1', name: 'Los Planetas', type: 'Group', country: 'ES', area: AREA.es, beginArea: AREA.granada, begin: '1993',
      genres: 'indie rock:4,shoegaze:1',
      rels: [member('backward', '67ffe546-f159-434a-ab70-d5d9520fae7e', 'Jota'), member('backward', '5a6cf934-5c05-4ba2-92d1-f46c76196141', 'Eric Jiménez'), url('free streaming', 'https://open.spotify.com/artist/0N1TIXCk9Q9JbEPXQDclEL')],
    }),
    releases: { years: [1993, 1997, 2001, 2007, 2014, 2020, 2026], labels: [other('1ca5ed29-e00b-4ea5-b817-0bcca0e04946', 'RCA', 17), other('71b46d7a-1f29-4bf4-b506-ea528f1d2329', 'BMG Music Spain, S.A.', 9), other('d835b913-3c4b-47a6-9a01-280985895644', 'El Ejército Rojo', 7), other('025674ce-2560-4001-a4ba-6521aec53778', 'Octubre', 7), lab('sony', 2), other('59dbf7f7-da6e-4795-8465-eb612639a39b', 'Elefant Records', 2)] },
  },
  'Rosalía': {
    artists: [
      S('25f3abd9-63b5-471a-bd25-feb9672dfa11', 'ROSALÍA', 'Person', 100, 'ES', 'Spain', 'Spanish singer', '1992-09-25', [['flamenco', 5], ['reggaeton', 3]]),
      S('ac0ee862-a6ca-4d39-a7a4-d8460534ba30', 'Rosalía', 'Person', 92, 'ES', 'Spain', '60s pop singer', '1944-05-21'),
      S('2ffc92fa-e51e-45ed-8a90-fa494aab50de', 'Rosalía', 'Person', 74, undefined, 'Ciudad de México', 'Mexican actress and singer', '1974-07-14'),
    ],
    labels: [SL('74e9fc2f-c5e6-4dc2-a81e-55097fa61245', 'Rosalia Music', 'Publisher', 100)],
    lookup: artist({
      id: '25f3abd9-63b5-471a-bd25-feb9672dfa11', name: 'ROSALÍA', type: 'Person', country: 'ES', area: AREA.es, beginArea: AREA.santcugat, begin: '1992-09-25', dis: 'Spanish singer',
      genres: 'flamenco:5,flamenco pop:2,hip hop:1,latin:2,latin pop:2,pop:1,reggaeton:3,singer-songwriter:1',
      tags: 'flamenco:5,reggaeton:3,english:2,female vocals:2,flamenco pop:2,latin:2,latin pop:2,spanish:2,hip hop:1',
      rels: [arel('involved with', 'backward', '46d3689c-23e6-46f7-8ad6-c12f13ac9dea', 'C. Tangana'), arel('sibling', 'backward', '2da62cb3-abd2-4ee5-a2d6-8fbbde93bc38', 'Pilar Vila Tobella'),
        url('free streaming', 'https://open.spotify.com/artist/7ltDVBr6mKbRvohxheJ9h1')],
    }),
    releases: { years: [2016, 2020, 2024, 2026], labels: [lab('columbia', 41), lab('sony', 7), other('99962abe-c219-4031-9c6c-c61fc3885944', 'Sony Music | Latin', 5), other('7c0b209a-0974-416d-bf52-b41889f5c0d3', 'Darkroom Records', 5)] },
  },
};

writeFileSync(new URL('./fixtures.json', import.meta.url), JSON.stringify(fx));
console.log('fixtures:', Object.keys(fx).length);
