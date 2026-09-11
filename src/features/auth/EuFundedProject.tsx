import { useInterfaceLanguage } from '../../i18n'
import './EuFundedProject.css'

export function EuFundingBanner() {
  const { language } = useInterfaceLanguage()
  return (
    <a className="eu-funding-link" href="https://innopredict.lt/">
      {language === 'lt' ? 'MB Neurocrop vykdomas ES projektas' : 'EU-funded project implemented by MB Neurocrop'}
    </a>
  )
}

// Keep previously shared project URLs useful after the move.
export default function EuFundedProjectPage() {
  const { language } = useInterfaceLanguage()
  return <main className="eu-project-moved"><h1>InnoPredict</h1><p>{language === 'lt'
    ? 'MB Neurocrop vykdomas ES projektas pristatomas atskiroje svetainėje.'
    : 'The EU-funded project implemented by MB Neurocrop has its own website.'}</p><a href="https://innopredict.lt/">innopredict.lt</a></main>
}
