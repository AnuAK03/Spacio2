import React, { useEffect, useState } from 'react';
import {
  Bike,
  Car,
  CheckCircle2,
  CreditCard,
  Phone,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  DriverProfile,
  UserSession,
  VehicleType,
  WheelerCategory,
} from '../types/parkpool';

export interface DriverProfilePayload {
  fullName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  licenseValidTill: string;
  wheelerCategory: WheelerCategory;
  vehicleType: VehicleType;
  vehicleModel: string;
  plateNumber: string;
  isEv: boolean;
}

interface DriverProfileViewProps {
  user: UserSession;
  existingProfile?: DriverProfile;
  onSaveProfile: (payload: DriverProfilePayload) => Promise<void>;
  onFindParking: () => void;
}

export const DriverProfileView: React.FC<DriverProfileViewProps> = ({
  user,
  existingProfile,
  onSaveProfile,
  onFindParking,
}) => {
  const [fullName, setFullName] = useState(existingProfile?.fullName || user.name);
  const [email] = useState(existingProfile?.email || user.email);
  const [phone, setPhone] = useState(existingProfile?.phone || '+91 98450 ');
  const [licenseNumber, setLicenseNumber] = useState(
    existingProfile?.licenseNumber || ''
  );
  const [licenseValidTill, setLicenseValidTill] = useState(
    existingProfile?.licenseValidTill || '2032-12-31'
  );
  const [wheelerCategory, setWheelerCategory] = useState<WheelerCategory>(
    existingProfile?.wheelerCategory || 'four_wheeler'
  );
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    existingProfile?.vehicleType || 'suv'
  );
  const [vehicleModel, setVehicleModel] = useState(
    existingProfile?.vehicleModel || ''
  );
  const [plateNumber, setPlateNumber] = useState(
    existingProfile?.plateNumber || ''
  );
  const [isEv, setIsEv] = useState(existingProfile?.isEv ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingProfile) {
      setFullName(existingProfile.fullName);
      setPhone(existingProfile.phone);
      setLicenseNumber(existingProfile.licenseNumber);
      setLicenseValidTill(existingProfile.licenseValidTill);
      setWheelerCategory(existingProfile.wheelerCategory);
      setVehicleType(existingProfile.vehicleType);
      setVehicleModel(existingProfile.vehicleModel);
      setPlateNumber(existingProfile.plateNumber);
      setIsEv(existingProfile.isEv);
    }
  }, [existingProfile]);

  const handleCategoryChange = (cat: WheelerCategory) => {
    setWheelerCategory(cat);
    if (cat === 'two_wheeler') {
      setVehicleType('two_wheeler');
    } else if (vehicleType === 'two_wheeler') {
      setVehicleType('hatchback');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSaveProfile({
        fullName,
        email,
        phone,
        licenseNumber,
        licenseValidTill,
        wheelerCategory,
        vehicleType,
        vehicleModel,
        plateNumber,
        isEv,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#111827]">
              Driver Profile & License
            </h1>
            <p className="mt-1 text-sm text-[#4B5563]">
              Register your driving license and vehicle details for faster gate check-in.
            </p>
          </div>
          {existingProfile && (
            <button
              type="button"
              onClick={onFindParking}
              className="whitespace-nowrap shrink-0 rounded-xl bg-gradient-to-r from-[#E0430D] to-[#C83709] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110"
            >
              Find Parking Now
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Registration Form */}
        <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-7">
          <h2 className="font-display text-lg font-bold text-[#111827]">
            Vehicle & License Registration
          </h2>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="drv-name" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Full Name
                </label>
                <input
                  id="drv-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="drv-phone" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Mobile Number
                </label>
                <input
                  id="drv-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98450 12345"
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="drv-dl" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Driving License Number
                </label>
                <input
                  id="drv-dl"
                  type="text"
                  required
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                  placeholder="KA04 20220048192"
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 font-mono text-sm uppercase text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="drv-dl-exp" className="mb-1 block text-xs font-semibold text-[#374151]">
                  License Valid Until
                </label>
                <input
                  id="drv-dl-exp"
                  type="date"
                  required
                  value={licenseValidTill}
                  onChange={(e) => setLicenseValidTill(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* 2-Wheeler / 4-Wheeler Multi-Choice */}
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#374151]">
                Vehicle Category
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleCategoryChange('two_wheeler')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all ${
                    wheelerCategory === 'two_wheeler'
                      ? 'border-[#D93F0B] bg-[#FFF0EA] text-[#C83709] ring-1 ring-[#D93F0B]'
                      : 'border-black/[0.08] bg-[#F8F7F4] text-[#374151] hover:border-black/20'
                  }`}
                >
                  <Bike className="h-4 w-4" />
                  <span>2-Wheeler</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCategoryChange('four_wheeler')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all ${
                    wheelerCategory === 'four_wheeler'
                      ? 'border-[#D93F0B] bg-[#FFF0EA] text-[#C83709] ring-1 ring-[#D93F0B]'
                      : 'border-black/[0.08] bg-[#F8F7F4] text-[#374151] hover:border-black/20'
                  }`}
                >
                  <Car className="h-4 w-4" />
                  <span>4-Wheeler</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <div>
                <label htmlFor="drv-vtype" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Body Type
                </label>
                {wheelerCategory === 'two_wheeler' ? (
                  <select
                    id="drv-vtype"
                    value="two_wheeler"
                    onChange={() => setVehicleType('two_wheeler')}
                    className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                  >
                    <option value="two_wheeler">Scooter / Motorcycle</option>
                  </select>
                ) : (
                  <select
                    id="drv-vtype"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                    className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                  >
                    <option value="hatchback">Hatchback</option>
                    <option value="sedan">Sedan</option>
                    <option value="suv">SUV</option>
                  </select>
                )}
              </div>

              <div>
                <label htmlFor="drv-model" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Vehicle Model
                </label>
                <input
                  id="drv-model"
                  type="text"
                  required
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder={
                    wheelerCategory === 'two_wheeler' ? 'e.g., Ather 450X' : 'e.g., Hyundai Creta'
                  }
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="drv-plate" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Vehicle Number
                </label>
                <input
                  id="drv-plate"
                  type="text"
                  required
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="KA-04-MN-8821"
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 font-mono text-sm uppercase text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs font-medium text-[#111827]">
              <input
                type="checkbox"
                checked={isEv}
                onChange={(e) => setIsEv(e.target.checked)}
                className="h-4 w-4 rounded accent-[#047857]"
              />
              <span>Electric Vehicle (EV Charging needed)</span>
            </label>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E0430D] to-[#C83709] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{saving ? 'Saving Profile...' : 'Save & Use This Vehicle'}</span>
            </button>
          </form>
        </section>

        {/* Registered Driver Pass Card */}
        <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-5">
          <h2 className="font-display text-lg font-bold text-[#111827]">
            Registered Driver Pass
          </h2>

          {existingProfile ? (
            <div className="mt-4 space-y-4">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#18122B] via-[#2B1B3D] to-[#0D3B36] p-5 text-white shadow-md">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FF5A1F]/30 blur-2xl"
                />
                <div className="relative z-10 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#34D399]">
                    <ShieldCheck className="h-4 w-4" />
                    License & RC Registered
                  </span>
                  <span className="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold">
                    {existingProfile.wheelerCategory === 'two_wheeler' ? '2-Wheeler' : '4-Wheeler'}
                  </span>
                </div>

                <div className="relative z-10 mt-4 font-display text-xl font-bold">
                  {existingProfile.fullName}
                </div>
                <div className="relative z-10 text-xs text-slate-300">{existingProfile.email}</div>

                <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-xs">
                  <div>
                    <div className="text-slate-300">Vehicle Number</div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-white">
                      {existingProfile.plateNumber}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-300">Driving License</div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-[#FF8A5C]">
                      {existingProfile.licenseNumber}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 rounded-xl border border-black/[0.06] bg-[#F8F7F4] p-4 text-xs text-[#374151]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Car className="h-3.5 w-3.5 text-[#C83709]" />
                    Vehicle
                  </span>
                  <span className="font-semibold text-[#111827]">
                    {existingProfile.vehicleModel} ({existingProfile.vehicleType.replace('_', '-')})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-[#4338CA]" />
                    Mobile
                  </span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {existingProfile.phone}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-[#047857]" />
                    License Valid Till
                  </span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {existingProfile.licenseValidTill}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-bold">
                <UserCheck className="h-4 w-4 text-amber-700" />
                <span>Profile Not Yet Registered</span>
              </div>
              <p className="mt-2 leading-relaxed">
                Complete the form on the left with your Driving License number and Vehicle
                Registration Plate to activate your personal vehicle pass and auto-fill gate
                check-ins.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
