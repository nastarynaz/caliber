export type LocatorProvider = "qr" | "ble" | "uwb" | "nfc" | "manual";
export type LocatorCapability = { provider: LocatorProvider; available: boolean; precisionMeters: number | null; safetyClearanceMeters: number | null };
export type EquipmentLocator = { equipmentId: string; provider: LocatorProvider; externalIdentity: string; zone: string | null; enabled: boolean };

export function validatedEquipmentPath(raw: string, knownIds: Set<string>, origin = "https://hub.invalid") {
  try {
    const url = new URL(raw, origin); if (url.origin !== origin) return null;
    const match = url.pathname.match(/^\/equipment\/(EQP-\d{6})$/);
    return match && knownIds.has(match[1]) ? match[0] : null;
  } catch { return null; }
}
