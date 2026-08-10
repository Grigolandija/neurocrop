import { useInterfaceLanguage } from '../../i18n'
import type { NeuroCropProduct } from './productChoice'

type ProductEntryScreenProps = {
  onSelect: (product: NeuroCropProduct) => void
}

function LanguageSwitch() {
  const { language, setLanguage, t } = useInterfaceLanguage()
  return (
    <div className="language-switch product-entry-language" role="group" aria-label={t('Language')}>
      <button type="button" data-language-option="lt" data-active={language === 'lt'} aria-pressed={language === 'lt'} onClick={() => setLanguage('lt')}>LT</button>
      <button type="button" data-language-option="en" data-active={language === 'en'} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    </div>
  )
}

export function ProductEntryScreen({ onSelect }: ProductEntryScreenProps) {
  const { language } = useInterfaceLanguage()
  const lt = language === 'lt'

  return (
    <main className="product-entry-screen">
      <section className="product-entry-shell" aria-labelledby="productEntryTitle">
        <LanguageSwitch />
        <header className="product-entry-header">
          <span className="product-entry-mark" aria-hidden="true"><i className="fa-solid fa-seedling" /></span>
          <div>
            <p className="product-entry-brand">NeuroCrop</p>
            <p>{lt ? 'Auginimo sprendimų platforma' : 'Crop decision platform'}</p>
          </div>
        </header>

        <div className="product-entry-copy">
          <p className="product-entry-eyebrow">{lt ? 'Pasirinkite aplinką' : 'Choose your environment'}</p>
          <h1 id="productEntryTitle">{lt ? 'Kur auginate?' : 'Where do you grow?'}</h1>
          <p>{lt ? 'Pasirinkite jūsų ūkiui skirtą „NeuroCrop“ darbo aplinką.' : 'Choose the NeuroCrop workspace built for your operation.'}</p>
        </div>

        <div className="product-entry-grid">
          <button className="product-choice-card field" type="button" onClick={() => onSelect('field')}>
            <span className="product-choice-topline">
              <span className="product-choice-icon" aria-hidden="true"><i className="fa-solid fa-wheat-awn" /></span>
              <span className="product-choice-status pending">{lt ? 'Kuriama' : 'In development'}</span>
            </span>
            <strong>NeuroCrop Field</strong>
            <span className="product-choice-description">{lt ? 'Dirvožemiui, vietos orams ir lauko pasėlių rizikoms.' : 'For soil, local weather, and open-field crop risks.'}</span>
            <span className="product-choice-action">{lt ? 'Peržiūrėti kryptį' : 'View product direction'} <i className="fa-solid fa-arrow-right" /></span>
          </button>

          <button className="product-choice-card greenhouse" type="button" onClick={() => onSelect('greenhouse')}>
            <span className="product-choice-topline">
              <span className="product-choice-icon" aria-hidden="true"><i className="fa-solid fa-house-chimney-window" /></span>
              <span className="product-choice-status available">{lt ? 'Veikia' : 'Available'}</span>
            </span>
            <strong>NeuroCrop Greenhouse</strong>
            <span className="product-choice-description">{lt ? 'Mikroklimatui, energijai, laistymui ir įrangos būklei.' : 'For microclimate, energy, irrigation, and equipment health.'}</span>
            <span className="product-choice-action">{lt ? 'Prisijungti' : 'Sign in'} <i className="fa-solid fa-arrow-right" /></span>
          </button>
        </div>
      </section>
    </main>
  )
}

export function FieldComingSoonScreen({ onBack }: { onBack: () => void }) {
  const { language } = useInterfaceLanguage()
  const lt = language === 'lt'

  return (
    <main className="product-entry-screen">
      <section className="product-entry-shell product-entry-coming-soon" aria-labelledby="fieldTitle">
        <LanguageSwitch />
        <button className="product-entry-back" type="button" onClick={onBack}><i className="fa-solid fa-arrow-left" /> {lt ? 'Keisti aplinką' : 'Change environment'}</button>
        <div className="field-coming-icon" aria-hidden="true"><i className="fa-solid fa-wheat-awn" /></div>
        <p className="product-entry-eyebrow">NeuroCrop Field</p>
        <h1 id="fieldTitle">{lt ? 'Lauko ūkių platforma kuriama' : 'The field platform is in development'}</h1>
        <p>{lt ? 'Ji bus skirta dirvožemio būklei, vietos orams, laistymui ir pasėlių rizikoms. Kol kas prisijungimas veikia tik „NeuroCrop Greenhouse“.' : 'It will cover soil conditions, local weather, irrigation, and crop risks. For now, sign-in is available only for NeuroCrop Greenhouse.'}</p>
        <button className="product-entry-primary" type="button" onClick={onBack}>{lt ? 'Grįžti į pasirinkimą' : 'Back to product selection'}</button>
      </section>
    </main>
  )
}
