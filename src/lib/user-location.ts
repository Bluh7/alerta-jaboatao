import { isValidLocation, type Location } from "./territory";

export function watchUserLocation(geolocation: Geolocation, update: (position: Location | null, status: string) => void,
  denied: () => void) {
  let active = true;
  const watch = geolocation.watchPosition(({ coords }) => {
    if (!active) return;
    const point = { lat: coords.latitude, lng: coords.longitude };
    update(isValidLocation(point) ? point : null, "");
  }, error => {
    if (!active) return;
    if (error.code === error.PERMISSION_DENIED) {
      update(null, "Acesso à localização negado. Para tentar novamente, permita o acesso nas configurações do navegador.");
      denied();
    } else {
      update(null, "Aguardando um sinal de localização. Verifique se a localização do aparelho está ativada.");
    }
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });

  return () => {
    active = false;
    geolocation.clearWatch(watch);
  };
}
