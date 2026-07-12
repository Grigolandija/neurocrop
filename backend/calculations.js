export function calcVPD(t, rh) {
  if (!validClimateInput(t, rh)) return null;
  const svp = saturationVaporPressure(t);
  return round(svp * (1 - rh / 100), 3);
}
export function calcDewPoint(t, rh) {
  if (!validClimateInput(t, rh) || Number(rh) === 0) return null;
  const a = 17.62, b = 243.12;
  const gamma = Math.log(rh / 100) + (a * t) / (b + t);
  return round((b * gamma) / (a - gamma), 2);
}
export function calcAbsoluteHumidity(t, rh) {
  if (!validClimateInput(t, rh)) return null;
  const svpPa = saturationVaporPressure(t) * 1000;
  const actualVpPa = svpPa * (rh / 100);
  return round(actualVpPa / (461.5 * (273.15 + t)) * 1000, 2);
}
function saturationVaporPressure(t) {
  return 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
}
function validClimateInput(t, rh) {
  const temperature = Number(t);
  const humidity = Number(rh);
  return Number.isFinite(temperature)
    && Number.isFinite(humidity)
    && temperature >= -80
    && temperature <= 80
    && humidity >= 0
    && humidity <= 100;
}
function round(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }
