import type { ObjectType } from '../model'

export const ltObjectLabels: Partial<Record<ObjectType, string>> = {
  'sensor-node': 'Sensoriaus mazgas',
  'growing-table': 'Auginimo stalas',
  'hydroponic-channel': 'Hidroponikos kanalas',
  'growing-bed': 'Lysvė',
  rack: 'Lentyna',
  reservoir: 'Rezervuaras',
  'irrigation-unit': 'Laistymo įrenginys',
  fan: 'Ventiliatorius',
  heater: 'Šildytuvas',
  'cooling-unit': 'Vėsinimo įrenginys',
  lamp: 'Lempa',
  door: 'Durys',
  window: 'Langas',
  'ventilation-opening': 'Vėdinimo anga',
  'electrical-cabinet': 'Elektros skydas',
  'technical-zone': 'Techninė zona',
  walkway: 'Takas',
  partition: 'Pertvara',
  'text-label': 'Teksto etiketė',
  rectangle: 'Stačiakampis',
}
