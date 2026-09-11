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
            <h1>{isLithuanian ? '„NeuroCrop“ – duomenimis grįstas augalų auginimo sprendimas' : 'NeuroCrop – a data-driven crop production solution'}</h1>
            <p>{isLithuanian
              ? 'Projekto metu vystoma „NeuroCrop“ – augalų auginimo sąlygų stebėsenos ir sprendimų paramos sistema. Belaidžiai sensorių mazgai ir skaitmeninė platforma padeda realiuoju laiku vertinti mikroklimatą, stebėti sąlygų pokyčius ir laiku priimti duomenimis pagrįstus sprendimus.'
              : 'The project develops NeuroCrop, a crop-condition monitoring and decision-support system. Wireless sensor nodes and a digital platform help evaluate microclimate conditions in real time, track changes and support timely, data-informed decisions.'}</p>
            <p>{isLithuanian
              ? 'Projekto tikslas – sukurti ir praktiškai išbandyti technologinį sprendimą, kuris padėtų augintojams efektyviau valdyti auginimo procesus, anksčiau pastebėti rizikas ir tikslingiau naudoti išteklius.'
              : 'The project aims to develop and validate a practical technology that helps growers manage production more efficiently, identify risks earlier and use resources more purposefully.'}</p>
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
