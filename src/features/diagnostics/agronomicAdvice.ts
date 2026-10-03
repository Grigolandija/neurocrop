import { growthAdvice } from './growthAdvice'
import type { AgronomicRisk, DiagnosticReport } from './types'

export type AgronomicAdvice = {priority:number;id:string;place:string;title:string;meaning:string;action:string;verify:string;evidence:string;limits:string;source:{title:string;url:string}}
const sources = {
 water:{title:'MSU Extension · VPD ir augalų vandens balansas',url:'https://www.canr.msu.edu/resources/vpd_vs_relative_humidity'},
 uptake:{title:'Wageningen University · VPD, žiotelės ir augalų kokybė',url:'https://research.wur.nl/en/publications/greenhouse-vapour-pressure-deficit-and-lighting-conditions-during/'},
 dew:{title:'UMass Extension · Drėgmės ir kondensato valdymas',url:'https://www.umass.edu/agriculture-food-environment/greenhouse-floriculture/fact-sheets/reducing-humidity-in-greenhouse'},
}
export function agronomicAdvice(report:DiagnosticReport,lt:boolean):AgronomicAdvice[]{
 const t=(a:string,b:string)=>lt?a:b
 const n=(v:number)=>v.toLocaleString(lt?'lt-LT':'en-GB',{maximumFractionDigits:1})
 // Older reports can support an interpretation of VPD exposure, but cannot support
 // claims about simultaneous root moisture, condensation, crop stage or episode length.
 const candidates:{risk:AgronomicRisk;summaryOnly:boolean}[]=report.agronomy!==undefined
  ?report.agronomy.filter((risk):risk is AgronomicRisk=>!('primaryMetric' in risk)).map(risk=>({risk,summaryOnly:false}))
  :report.nodes.filter(m=>m.metric==='vpd'&&m.observedMinutes>0&&m.coveragePct>=50).flatMap(m=>(['high-vpd','low-vpd'] as const).flatMap(kind=>{
    const minutes=kind==='high-vpd'?m.aboveMinutes:m.belowMinutes
    return minutes>=30?[{summaryOnly:true,risk:{kind,nodeId:m.nodeId||'',nodeName:m.nodeName||m.nodeId||m.name,sectionId:m.sectionId,sectionName:m.name,profileId:null,stage:null,crops:[],estimated:m.estimatedContextPct>0,minutes,longestMinutes:0,rootDryMinutes:0,rootObservedMinutes:0,vpdMin:m.minimum??0,vpdMax:m.maximum??0,target:null,firstAt:report.from,lastAt:report.to,dewPoint:null,leafTemperature:null}}]:[]
  }))
 const selected=new Map<string,typeof candidates[number]>()
 for(const c of candidates){const key=`${c.risk.sectionId}:${c.risk.kind}`;if(!selected.has(key)||selected.get(key)!.risk.minutes<c.risk.minutes)selected.set(key,c)}
 const ranked=[...selected.values()].sort((a,b)=>{
  const priority=(r:AgronomicRisk)=>r.kind==='leaf-condensation'?3:r.rootDryMinutes>=30?2:1
  return priority(b.risk)-priority(a.risk)||b.risk.minutes-a.risk.minutes
 })
 const waterAdvice=ranked.map(({risk:r,summaryOnly})=>{
  const high=r.kind==='high-vpd',dew=r.kind==='leaf-condensation',dry=r.rootDryMinutes>=30
  const title=dew?t('Lapų paviršiuje galėjo susidaryti kondensatas','Leaf surfaces may have developed condensation'):high?dry?t('Didelė garinimo apkrova sutapo su sausa šaknų zona','High evaporative demand coincided with a dry root zone'):t('Galima vandens streso ir ribotos fotosintezės rizika','Possible water stress and restricted photosynthesis'):t('Silpnesnis garinimas gali mažinti vandens poreikį','Reduced evaporative demand may lower water requirements')
  const meaning=dew
   ?t('Lapo temperatūra pasiekė apskaičiuotą rasos tašką arba nukrito žemiau jo. Tokiomis sąlygomis lapas gali sušlapti, o ilgai drėgni lapai sudaro palankesnes sąlygas daliai grybininių ligų. Tai aplinkos rizika, ne nustatyta infekcija.','Measured leaf temperature reached or fell below the calculated dew point. Leaves may become wet, creating conditions favourable to some fungal diseases if wetness persists. This is an environmental risk, not a diagnosed infection.')
   :high?t('Kai oro garų slėgio deficitas (VPD) didelis, aplinka stipriau skatina augalą netekti vandens. Jei šaknys nespėja jo tiekti, augalas gali užverti žioteles: tuomet ribojamas ir CO₂ patekimas fotosintezei. Vien CO₂ didinimas tokio ribojimo neišsprendžia.','High air vapour-pressure deficit (VPD) increases atmospheric demand for water. If roots cannot keep up, plants may close stomata, restricting CO₂ entry for photosynthesis. Adding CO₂ alone does not resolve that limitation.')
   :t('Mažas oro garų slėgio deficitas (VPD) silpnina garinimo varomąją jėgą. Ankstesniam, sausesniam orui pritaikytas laistymo grafikas gali tiekti daugiau vandens, nei augalas tuo metu sunaudoja. Ilgalaikis režimas svarbus augalo prisitaikymui; vienas toks laikotarpis žalos neįrodo.','Low air vapour-pressure deficit (VPD) reduces the driving force for water loss. Irrigation scheduled for drier conditions may supply more water than the plant currently uses. Sustained conditions affect plant acclimation; one period does not establish damage.')
  const action=dew?t('Pirmiausia apžiūrėkite lapus nurodytoje vietoje. Jei jie drėgni, šalinkite užsistovėjusią drėgmę lajoje: patikrinkite oro judėjimą ir derinkite sausinimą ar vėdinimą su šildymu, neperžengdami kultūros temperatūros ribų. Lapus šlapinantį laistymą planuokite taip, kad jie spėtų nudžiūti prieš naktį.','First inspect leaves at this location. If wet, address trapped canopy moisture: check air movement and coordinate dehumidification or ventilation with heating within crop temperature limits. Schedule irrigation that wets foliage so leaves can dry before night.')
   :high?dry?t('Pirmas prioritetas — vandens tiekimas šaknims šioje vietoje: patikrinkite lašintuvų veikimą ir kontroliniu matavimu patvirtinkite substrato drėgmę. Tik patvirtinus trūkumą koreguokite laistymo laiką ar dažnį. Kartu įvertinkite vėsinimą; vien didesnė vandens dozė oro sąlygų nepakeis.','First check water delivery to roots here: inspect emitters and confirm substrate moisture with a reference measurement. Adjust irrigation timing or frequency only if the deficit is confirmed. Also assess cooling; a larger water dose alone will not change air conditions.')
    :t('Prieš didindami laistymą patikrinkite substrato drėgmę ir vandens tiekimą. Jei šaknų zona pakankamai drėgna, pirmiau įvertinkite vėsinimą ar kontroliuojamą oro drėkinimą pagal kultūros ribas. Jei sausa — koreguokite vandens tiekimą. Šių dviejų atvejų sprendimai skiriasi.','Check substrate moisture and water delivery before increasing irrigation. If the root zone is adequately moist, first assess cooling or controlled humidification within crop limits. If dry, correct water delivery. These situations require different responses.')
   :t('Laistymo poreikį patvirtinkite pagal substrato drėgmę ir jo džiūvimą, o ne vien laikmatį. Jei substratas išlieka šlapias, peržiūrėkite kitą laistymo ciklą. Jei profilis numato didesnį VPD, patikrinkite drėgmės šalinimą ir oro judėjimą lajoje; vien daugiau šilumos neišneša vandens iš šiltnamio.','Confirm irrigation need from substrate moisture and drying, rather than the timer alone. If the substrate remains wet, review the next irrigation cycle. If the profile calls for higher VPD, check moisture removal and canopy airflow; heating alone does not remove water from the greenhouse.')
  const verify=dew?t('Po korekcijos patikrinkite, ar lapai sausi ir jų temperatūra išlieka aukščiau rasos taško. Mažesnė kambario drėgmė pati savaime nepatvirtina, kad laja išdžiūvo.','After adjustment, check that leaves are dry and remain above dew point. Lower room humidity alone does not establish that the canopy is dry.')
   :high?t('Palyginkite kitą panašų laikotarpį: VPD nukrypimo trukmę, substrato drėgmę ir augalų vytimo požymius. Pagerėjimą turi patvirtinti ir vandens būklė, ne tik mažesnis VPD.','Compare the next similar period: duration of high VPD, substrate moisture and signs of wilting. Improvement should include water status, not just a lower VPD.')
   :t('Patikrinkite, ar substratas tarp laistymų džiūsta pagal pasirinktą auginimo strategiją ir ar korekcija nesukėlė per didelio VPD.','Check that the substrate dries between irrigations as intended by the growing strategy and that the adjustment has not produced excessive VPD.')
  let evidence=dew?t(`${r.nodeName}: lapo temperatūra ${n(r.leafTemperature!)} °C, rasos taškas ${n(r.dewPoint!)} °C vienu metu. Sąlyga užfiksuota ${n(r.minutes/60)} h.`,`${r.nodeName}: leaf temperature ${n(r.leafTemperature!)} °C and dew point ${n(r.dewPoint!)} °C at the same time. Condition recorded for ${n(r.minutes/60)} h.`)
   :t(`${r.nodeName}: VPD ${high?'virš':'žemiau'} profilio ribos ${n(r.minutes/60)} h.`,`${r.nodeName}: VPD ${high?'above':'below'} the profile target for ${n(r.minutes/60)} h.`)
  if(!summaryOnly)evidence+=t(` Ilgiausias nenutrūkstamas laikotarpis ${n(r.longestMinutes/60)} h.`,` Longest continuous period ${n(r.longestMinutes/60)} h.`)
  if(dry)evidence+=t(` Sausa šaknų zona tuo pat metu: ${n(r.rootDryMinutes/60)} h.`,` Concurrent root-zone readings below target: ${n(r.rootDryMinutes/60)} h.`)
  const context=[...r.crops,r.stage].filter(Boolean).join(' · ')
  let limits=context?t(`Auginimo kontekstas: ${context}. `,`Growing context: ${context}. `):t('Kultūra ar stadija šiuose matavimuose nepatvirtinta; taikomas bendras fiziologinis vertinimas. ','Crop or stage is not confirmed in these readings; this is a general physiological interpretation. ')
  if(r.estimated&&!dew)limits+=t('Istorinės ribos dalinai nepatvirtintos — prieš korekciją patikrinkite jų tinkamumą. ','Historical targets are partly unverified — confirm their suitability before adjusting. ')
  if(summaryOnly)limits+=t('Tai atskirų VPD matavimų vertinimas; sutapimas su šaknų drėgme ir nenutrūkstamos trukmės nežinomi.','This uses VPD summaries; simultaneous root moisture and continuous durations are unknown.')
  else if(high&&!r.rootObservedMinutes)limits+=t('Nėra tinkamų vienalaikių šaknų zonos drėgmės duomenų — vandens trūkumas substrate nepatvirtintas.','No suitable simultaneous root-zone moisture evidence — substrate water deficit is not established.')
  return {priority:dew?100:dry?95:high?80:65,id:`${r.sectionId}:${r.kind}`,place:r.sectionName,title,meaning,action,verify,evidence,limits,source:dew?sources.dew:high?sources.water:sources.uptake}
 })
 return [...growthAdvice(report,lt),...waterAdvice].sort((a,b)=>b.priority-a.priority)
}
