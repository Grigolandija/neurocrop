import { useCallback, useSyncExternalStore } from 'react'
import { additionalLtTranslations } from './i18n.additional.lt'
import { ltTranslations } from './i18n.lt'

export type InterfaceLanguage = 'en' | 'lt'

const languageStorageKey = 'neurocrop-interface-language-v1'
const settingsStorageKey = 'neurocrop-dashboard-settings-v1'
const languageListeners = new Set<() => void>()
let activeLanguage: InterfaceLanguage | null = null

const authTranslations: Record<string, string> = {
  ...ltTranslations,
  ...additionalLtTranslations,
  'New account': 'Nauja paskyra',
  'Request your workspace.': 'Paprašykite darbo aplinkos.',
  'Create your user account first. NeuroCrop will approve the organization before sensor data is connected.': 'Pirmiausia sukurkite naudotojo paskyrą. „NeuroCrop“ patvirtins organizaciją prieš prijungiant sensorių duomenis.',
  'Create NeuroCrop access': 'Sukurti „NeuroCrop“ prieigą',
  'Enter your details and the organization name you want to manage.': 'Įveskite savo duomenis ir organizacijos, kurią norite valdyti, pavadinimą.',
  'Email address': 'El. pašto adresas',
  'Your name': 'Jūsų vardas',
  'Full name': 'Vardas ir pavardė',
  'Organization name': 'Organizacijos pavadinimas',
  'Farm or company name': 'Ūkio arba įmonės pavadinimas',
  'Password': 'Slaptažodis',
  'At least 12 characters': 'Bent 12 simbolių',
  'Creating account...': 'Kuriama paskyra...',
  'Create account': 'Sukurti paskyrą',
  'Back to sign in': 'Grįžti į prisijungimą',
  'Enter a valid email address.': 'Įveskite tinkamą el. pašto adresą.',
  'Enter your name.': 'Įveskite savo vardą.',
  'Enter an organization name.': 'Įveskite organizacijos pavadinimą.',
  'Use a password with at least 12 characters.': 'Naudokite bent 12 simbolių slaptažodį.',
  'Account created. NeuroCrop will review your workspace request.': 'Paskyra sukurta. „NeuroCrop“ peržiūrės jūsų darbo aplinkos prašymą.',
  'We could not create this account.': 'Šios paskyros sukurti nepavyko.',
  'Workspace invitation': 'Darbo aplinkos kvietimas',
  'Join your farm workspace.': 'Prisijunkite prie savo ūkio darbo aplinkos.',
  'Use a verified invitation to create your account or connect an existing NeuroCrop account.': 'Naudokite patvirtintą kvietimą paskyrai sukurti arba esamai „NeuroCrop“ paskyrai prijungti.',
  'Checking invitation': 'Tikrinamas kvietimas',
  'Confirming that this invitation is still active.': 'Tikrinama, ar šis kvietimas vis dar galioja.',
  'Invitation cancelled': 'Kvietimas atšauktas',
  'The organization administrator cancelled this invitation. Contact them if you still need access.': 'Organizacijos administratorius atšaukė šį kvietimą. Jei prieigos vis dar reikia, susisiekite su juo.',
  'Invitation expired': 'Kvietimo galiojimas baigėsi',
  'This invitation is no longer active. Ask the organization administrator to send a new one.': 'Šis kvietimas nebegalioja. Paprašykite organizacijos administratoriaus atsiųsti naują.',
  'Invitation already accepted': 'Kvietimas jau priimtas',
  'This link has already been used. Sign in with the account that accepted the invitation.': 'Ši nuoroda jau panaudota. Prisijunkite paskyra, kuri priėmė kvietimą.',
  'Organization unavailable': 'Organizacija nepasiekiama',
  'This organization can no longer accept new members.': 'Ši organizacija nebegali priimti naujų narių.',
  'Invalid invitation': 'Netinkamas kvietimas',
  'This invitation link is incomplete or not valid.': 'Ši kvietimo nuoroda yra neišsami arba netinkama.',
  'Invitation could not be checked': 'Kvietimo patikrinti nepavyko',
  'NeuroCrop could not reach the service. Check your connection and try again.': '„NeuroCrop“ nepavyko pasiekti paslaugos. Patikrinkite ryšį ir bandykite dar kartą.',
  'Invitation': 'Kvietimas',
  'Join': 'Prisijungti prie',
  'organization': 'organizacijos',
  'Your NeuroCrop password': 'Jūsų „NeuroCrop“ slaptažodis',
  'Create a password': 'Sukurti slaptažodį',
  'Enter your existing password': 'Įveskite esamą slaptažodį',
  'Setting up access...': 'Ruošiama prieiga...',
  'Accept invitation': 'Priimti kvietimą',
  'Organization:': 'Organizacija:',
  'Try again': 'Bandyti dar kartą',
  'We could not accept this invitation.': 'Šio kvietimo priimti nepavyko.',
  'Language': 'Kalba',
  'Sign out': 'Atsijungti',
  'Monitor': 'Stebėjimas',
  'Manage': 'Valdyti',
  'Overview': 'Apžvalga',
  'Areas': 'Erdvės',
  'Sections': 'Sekcijos',
  'Nodes': 'Mazgai',
  'Readings': 'Rodmenys',
  'Trends': 'Tendencijos',
  'Alerts': 'Perspėjimai',
  'open alerts': 'aktyvūs perspėjimai',
  'Actions': 'Veiksmai',
  'Profiles': 'Profiliai',
  'Simulator': 'Simuliatorius',
  'Settings': 'Nustatymai',
  'Organisation': 'Organizacija',
  'Admin': 'Administravimas',
  'Online': 'Prisijungta',
  'Offline': 'Neprisijungta',
  'Systems online': 'Sistemos veikia',
  'System attention': 'Reikia sistemos dėmesio',
  'Workspace member': 'Darbo aplinkos narys',
  'Create an Area first': 'Pirmiausia sukurkite erdvę',
  'Create a Section first': 'Pirmiausia sukurkite sekciją',
  'Open navigation': 'Atidaryti navigaciją',
  'Close navigation': 'Uždaryti navigaciją',
  'Low battery nodes': 'Mazgai su silpna baterija',
  'Nodes below configured threshold': 'Mazgai žemiau nustatytos baterijos ribos',
  'No low-battery nodes.': 'Nėra mazgų su silpna baterija.',
  'Know what your crop needs next.': 'Žinokite, ko jūsų augalams reikia dabar.',
  'A single workspace for live growing conditions, section history, alerts, and sensor health.': 'Viena sistema esamoms auginimo sąlygoms, sekcijų istorijai, perspėjimams ir sensorių būklei.',
  'Workspace access': 'Prieiga prie sistemos',
  'Sign in to NeuroCrop': 'Prisijungti prie „NeuroCrop“',
  'Use the email address assigned to your farm workspace.': 'Naudokite jūsų ūkiui priskirtą el. pašto adresą.',
  'Enter your password': 'Įveskite slaptažodį',
  'Sign in': 'Prisijungti',
  'Signing in…': 'Jungiamasi…',
  'Need access?': 'Reikia prieigos?',
  'Create account and request workspace': 'Sukurti paskyrą ir paprašyti darbo aplinkos',
  'Forgot password?': 'Pamiršote slaptažodį?',
  'Account recovery': 'Paskyros atkūrimas',
  'Recover access securely.': 'Saugiai atkurkite prieigą.',
  'Request a single-use link to choose a new password without exposing account details.': 'Gaukite vienkartinę nuorodą naujam slaptažodžiui nustatyti neatskleidžiant paskyros duomenų.',
  'Forgot your password?': 'Pamiršote slaptažodį?',
  'Enter the email address used for your NeuroCrop account.': 'Įveskite savo „NeuroCrop“ paskyros el. pašto adresą.',
  'Sending reset link…': 'Siunčiama atkūrimo nuoroda…',
  'Send reset link': 'Siųsti atkūrimo nuorodą',
  'Password reset request failed.': 'Nepavyko paprašyti slaptažodžio atkūrimo.',
  'Check your email': 'Patikrinkite el. paštą',
  'If an active NeuroCrop account uses this address, a reset link will arrive shortly.': 'Jei šiuo adresu registruota aktyvi „NeuroCrop“ paskyra, netrukus gausite atkūrimo nuorodą.',
  'The link is valid for 60 minutes and can be used once.': 'Nuoroda galioja 60 minučių ir gali būti panaudota vieną kartą.',
  'Use another email address': 'Naudoti kitą el. pašto adresą',
  'Protect your growing workspace.': 'Apsaugokite savo auginimo darbo aplinką.',
  'Choose a new password. Existing NeuroCrop sessions will be signed out automatically.': 'Pasirinkite naują slaptažodį. Esamos „NeuroCrop“ sesijos bus automatiškai atjungtos.',
  'Choose a new password': 'Pasirinkite naują slaptažodį',
  'Use at least 12 characters and do not reuse your previous password.': 'Naudokite bent 12 simbolių ir nekartokite ankstesnio slaptažodžio.',
  'New password': 'Naujas slaptažodis',
  'Confirm new password': 'Pakartokite naują slaptažodį',
  'Enter the password again': 'Įveskite slaptažodį dar kartą',
  'Changing password…': 'Keičiamas slaptažodis…',
  'The passwords do not match.': 'Slaptažodžiai nesutampa.',
  'This password reset link is incomplete. Request a new one.': 'Ši slaptažodžio atkūrimo nuoroda nepilna. Paprašykite naujos.',
  'Password could not be changed.': 'Slaptažodžio pakeisti nepavyko.',
  'Password changed': 'Slaptažodis pakeistas',
  'Your new password is ready. Sign in again on this device.': 'Naujas slaptažodis paruoštas. Prisijunkite šiame įrenginyje iš naujo.',
  'All previous sessions have been signed out.': 'Visos ankstesnės sesijos buvo atjungtos.',
  'Skip to main content': 'Pereiti prie pagrindinio turinio',
  'Air temperature': 'Oro temperatūra',
  'Relative humidity': 'Santykinė drėgmė',
  'Vapour pressure deficit': 'Garų slėgio deficitas',
  'Carbon dioxide': 'Anglies dioksidas',
  'Leaf temperature': 'Lapo temperatūra',
  'Soil moisture': 'Substrato drėgmė',
  'Soil temperature': 'Substrato temperatūra',
  'Electrical conductivity': 'Elektrinis laidumas',
  'Water temperature': 'Vandens temperatūra',
  'Light': 'Apšvietimas',
  'Battery level': 'Baterijos lygis',
}

export function getInterfaceLanguage(): InterfaceLanguage {
  if (activeLanguage) return activeLanguage
  try {
    const stored = localStorage.getItem(languageStorageKey)
    if (stored === 'lt' || stored === 'en') return stored
    const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}') as { preferences?: { locale?: string } }
    return settings.preferences?.locale === 'lt-LT' ? 'lt' : 'en'
  } catch {
    return 'en'
  }
}

export function setInterfaceLanguage(language: InterfaceLanguage) {
  if (activeLanguage === language) return
  activeLanguage = language
  try {
    localStorage.setItem(languageStorageKey, language)
    const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}') as Record<string, unknown> & { preferences?: Record<string, unknown> }
    localStorage.setItem(settingsStorageKey, JSON.stringify({
      ...settings,
      preferences: { ...(settings.preferences || {}), locale: language === 'lt' ? 'lt-LT' : 'en-GB' },
    }))
  } catch {
    // The active page can still switch language if browser storage is unavailable.
  }
  document.documentElement.lang = language
  languageListeners.forEach((listener) => listener())
}

export function useInterfaceLanguage() {
  const language = useSyncExternalStore(
    (listener) => {
      languageListeners.add(listener)
      return () => languageListeners.delete(listener)
    },
    getInterfaceLanguage,
    () => 'en',
  )

  const setLanguage = useCallback((next: InterfaceLanguage) => {
    setInterfaceLanguage(next)
  }, [])

  const t = useCallback((english: string) => language === 'lt' ? authTranslations[english] || english : english, [language])
  return { language, setLanguage, t }
}

export function translateInterfaceText(english: string) {
  return getInterfaceLanguage() === 'lt' ? authTranslations[english] || english : english
}
