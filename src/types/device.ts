export interface DeviceSnapshot {
  manufacturer: string;
  brand: string;
  model: string;
  codename: string;
  androidVersion: string;
  sdkVersion: string;
  securityPatch: string;
  serial: string;
}

export interface AdvertisedSpecs {
  manufacturer: string;
  model: string;
  storageGB: string;
  ramGB: string;
  chipset: string;
  androidVersion: string;
  displayResolution: string;
  batteryDesignMah: string;
}
