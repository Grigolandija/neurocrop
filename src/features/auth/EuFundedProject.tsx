import { Link } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import './EuFundedProject.css'

const requiredFundingStatement = '2022–2030 m. plėtros programos valdytoja LR Švietimo, mokslo ir sporto ministerija. Finansavimo šaltinis – ES fondų lėšos ir bendrojo finansavimo lėšos.'

export function EuFundingBanner() {
  const { language } = useInterfaceLanguage()
  const isLithuanian = language === 'lt'

  return (
    <Link className="eu-funding-banner" to="/es-finansuojamas-projektas" aria-label={isLithuanian ? 'Plačiau apie ES finansuojamą projektą' : 'Learn more about the EU-funded project'}>
      <img
        className="eu-funding-banner-logo"
        src={isLithuanian ? '/eu-co-funded-lt.png' : '/eu-co-funded-en.png'}
        alt={isLithuanian ? 'Bendrai finansuoja Europos Sąjunga' : 'Co-funded by the European Union'}
      />
      <span className="eu-funding-banner-copy">
        <strong>{isLithuanian ? 'ES finansuojamas projektas' : 'EU-funded project'}</strong>
      </span>
      <span className="eu-funding-banner-link">{isLithuanian ? 'Apie projektą' : 'About the project'} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></span>
    </Link>
  )
}

export default function EuFundedProjectPage() {
  const { language, setLanguage } = useInterfaceLanguage()
  const isLithuanian = language === 'lt'

  return (
    <main className="eu-project-page">
      <div className="eu-project-shell">
        <header className="eu-project-header">
          <Link className="eu-project-brand" to="/" aria-label={isLithuanian ? 'Grįžti į NeuroCrop' : 'Return to NeuroCrop'}>
            <span className="eu-project-brand-mark"><i className="fa-solid fa-seedling" aria-hidden="true" /></span>
            <span>NeuroCrop</span>
          </Link>
          <div className="language-switch eu-project-language" role="group" aria-label={isLithuanian ? 'Kalba' : 'Language'}>
            <button type="button" data-active={isLithuanian} aria-pressed={isLithuanian} onClick={() => setLanguage('lt')}>LT</button>
            <button type="button" data-active={!isLithuanian} aria-pressed={!isLithuanian} onClick={() => setLanguage('en')}>EN</button>
          </div>
        </header>

        <section className="eu-project-hero">
          <div className="eu-project-intro">
            <p className="eu-project-eyebrow">{isLithuanian ? 'ES finansuojamas projektas' : 'EU-funded project'}</p>
            <h1>InnoPredict</h1>
            <p className="eu-project-title">{isLithuanian
              ? 'Dirbtinio intelekto mokymui skirtos duomenų surinkimo ir perdavimo sistemos optimizavimas'
              : 'Optimising a data collection and transmission system for artificial intelligence training'}</p>
            <p>{isLithuanian
              ? 'MB Neurocrop įgyvendina projektą „InnoPredict“, kurio tikslas – patobulinti ir parengti komerciniam naudojimui modulinę duomenų surinkimo ir perdavimo sistemą, skirtą hidroponiniams ūkiams. Sistema kuriama automatiniam mikroklimato ir auginimo procesų duomenų rinkimui bei perdavimui į nuotolinę debesijos saugyklą.'
              : 'MB Neurocrop is implementing InnoPredict, a project to improve a modular data collection and transmission system for hydroponic farms and prepare it for commercial use. The system is being developed to automatically collect microclimate and growing-process data and transmit it to a remote cloud repository.'}</p>
            <p>{isLithuanian
              ? 'Projekto metu numatoma didinti jutiklių matavimo tikslumą, mažinti sistemos energijos sąnaudas, gerinti duomenų perdavimo stabilumą ir saugumą bei tobulinti sąsają su duomenų analizės aplinkomis. Sistema bus išbandoma realiomis hidroponinio ūkio sąlygomis ir koreguojama pagal bandymų rezultatus.'
              : 'Planned work includes improving sensor accuracy, reducing system energy consumption, strengthening transmission reliability and security, and improving integration with data analysis environments. The system will be tested under real hydroponic farm conditions and refined based on the results.'}</p>
            <p>{isLithuanian
              ? 'Numatomas rezultatas – praktiškai patikrinta, rinkai parengta sistema ir nuoseklūs, struktūruoti duomenys, tinkami dirbtinio intelekto modeliams mokyti bei vertinti. Taip siekiama sudaryti pagrindą sprendimams, kurie ateityje padėtų prognozuoti auginimo sąlygas ir efektyviau naudoti ūkio išteklius.'
              : 'The expected outcome is a validated, market-ready system and consistent, structured data suitable for training and evaluating artificial intelligence models. This is intended to provide a foundation for future solutions that predict growing conditions and support more efficient use of farm resources.'}</p>
          </div>

          <aside className="eu-project-funding" aria-label={isLithuanian ? 'Projekto finansavimas' : 'Project funding'}>
            <img
              src={isLithuanian ? '/eu-co-funded-lt.png' : '/eu-co-funded-en.png'}
              alt={isLithuanian ? 'Bendrai finansuoja Europos Sąjunga' : 'Co-funded by the European Union'}
            />
            <div className="eu-project-official-statement">
              <p className="eu-project-statement-label">{isLithuanian ? 'Finansavimo informacija' : 'Official funding information'}</p>
              <p lang="lt">{requiredFundingStatement}</p>
            </div>
          </aside>
        </section>

        <footer className="eu-project-footer">
          <Link className="eu-project-back" to="/"><i className="fa-solid fa-arrow-left" aria-hidden="true" /> {isLithuanian ? 'Grįžti į prisijungimą' : 'Back to sign in'}</Link>
        </footer>
      </div>
    </main>
  )
}
