import { describe, expect, it, vi } from "vitest";
import { watchUserLocation } from "../../src/lib/user-location";

function simulateWatch() {
  const update = vi.fn();
  const denied = vi.fn();
  let success!: PositionCallback;
  let failure!: PositionErrorCallback;
  const geolocation: Geolocation = {
    getCurrentPosition: vi.fn(),
    watchPosition(onSuccess, onError) {
      success = onSuccess;
      failure = onError!;
      return 42;
    },
    clearWatch: vi.fn(),
  };
  const stop = watchUserLocation(geolocation, update, denied);
  return {
    update, denied, stop, geolocation,
    move(latitude: number, longitude: number) {
      success({ coords: { latitude, longitude } } as GeolocationPosition);
    },
    fail(code: number) {
      failure({ code, message: "", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    },
  };
}

describe("acompanhamento da localização", () => {
  it("atualiza a posição em Jaboatão, oculta ao sair e volta a exibir ao retornar", () => {
    const watch = simulateWatch();
    watch.move(-8.145, -35.005);
    expect(watch.update).toHaveBeenLastCalledWith({ lat: -8.145, lng: -35.005 }, expect.any(String));
    watch.move(-8.16178, -34.92483);
    expect(watch.update).toHaveBeenLastCalledWith({ lat: -8.16178, lng: -34.92483 }, expect.any(String));
    watch.move(-8.05, -34.9);
    expect(watch.update).toHaveBeenLastCalledWith(null, expect.stringContaining("fora da área de cobertura"), true);
    watch.move(-8.145, -35.005);
    expect(watch.update).toHaveBeenLastCalledWith({ lat: -8.145, lng: -35.005 }, expect.any(String));
    watch.stop();
  });

  it("oculta a posição após perda de sinal e avisa quando a permissão é negada", () => {
    const watch = simulateWatch();
    watch.move(-8.145, -35.005);
    watch.fail(3);
    expect(watch.update).toHaveBeenLastCalledWith(null, expect.stringContaining("Aguardando"));
    expect(watch.denied).not.toHaveBeenCalled();
    watch.fail(1);
    expect(watch.update).toHaveBeenLastCalledWith(null, expect.stringContaining("Acesso à localização negado"));
    expect(watch.denied).toHaveBeenCalledOnce();
    watch.stop();
  });

  it("cancela o monitoramento e ignora eventos entregues após parar", () => {
    const watch = simulateWatch();
    watch.stop();
    expect(watch.geolocation.clearWatch).toHaveBeenCalledExactlyOnceWith(42);
    watch.move(-8.145, -35.005);
    watch.fail(1);
    expect(watch.update).not.toHaveBeenCalled();
    expect(watch.denied).not.toHaveBeenCalled();
  });
});
