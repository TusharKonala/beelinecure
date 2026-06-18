"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MedicineNameAutocomplete } from "./MedicineNameAutocomplete";

type MedicineInput = {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: string;
  instructions: string;
};

type PrescriptionApiMedicine = {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions: string;
};

type PrescriptionPayload = {
  medicines: PrescriptionApiMedicine[];
  generalNotes: string | null;
};

function buildPrescriptionPayload(
  medicines: MedicineInput[],
  generalNotes: string,
): PrescriptionPayload {
  return {
    medicines: medicines.map((medicine) => ({
      name: medicine.name.trim(),
      dosage: medicine.dosage.trim(),
      frequency: medicine.frequency.trim(),
      durationDays: Number(medicine.durationDays),
      instructions: medicine.instructions.trim(),
    })),
    generalNotes: generalNotes.trim() || null,
  };
}

const emptyMedicine = (): MedicineInput => ({
  name: "",
  dosage: "",
  frequency: "",
  durationDays: "",
  instructions: "",
});

function mapApiMedicineToInput(medicine: PrescriptionApiMedicine): MedicineInput {
  return {
    name: medicine.name,
    dosage: medicine.dosage,
    frequency: medicine.frequency,
    durationDays: String(medicine.durationDays),
    instructions: medicine.instructions,
  };
}

export function PrescriptionForm({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [medicines, setMedicines] = useState<MedicineInput[]>([emptyMedicine()]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [isEditingExistingPrescription, setIsEditingExistingPrescription] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<PrescriptionPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadExistingPrescription() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/doctor/appointments/${appointmentId}/prescription`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Failed to load prescription");
        }
        const data = (await res.json()) as {
          prescription?: { medicines?: PrescriptionApiMedicine[]; generalNotes?: string | null } | null;
        };
        if (cancelled) return;
        setIsEditingExistingPrescription(Boolean(data.prescription));
        const existingMedicines = data.prescription?.medicines;
        const rows = Array.isArray(existingMedicines)
          ? existingMedicines.map(mapApiMedicineToInput)
          : [];
        const notes = data.prescription?.generalNotes ?? "";
        setMedicines(rows.length > 0 ? rows : [emptyMedicine()]);
        setGeneralNotes(notes);
        if (data.prescription) {
          setInitialSnapshot(
            buildPrescriptionPayload(
              rows.length > 0 ? rows : [emptyMedicine()],
              notes,
            ),
          );
        } else {
          setInitialSnapshot(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load prescription");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadExistingPrescription();
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  const hasInvalidMedicine = useMemo(
    () =>
      medicines.some((medicine) => {
        const duration = Number(medicine.durationDays);
        return (
          !medicine.name.trim() ||
          !medicine.dosage.trim() ||
          !medicine.frequency.trim() ||
          !Number.isFinite(duration) ||
          duration <= 0
        );
      }),
    [medicines],
  );

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return (
      JSON.stringify(buildPrescriptionPayload(medicines, generalNotes)) !==
      JSON.stringify(initialSnapshot)
    );
  }, [initialSnapshot, medicines, generalNotes]);

  function updateMedicine(index: number, key: keyof MedicineInput, value: string) {
    setMedicines((current) =>
      current.map((medicine, i) => (i === index ? { ...medicine, [key]: value } : medicine)),
    );
  }

  function addMedicineRow() {
    setMedicines((current) => [...current, emptyMedicine()]);
  }

  function removeMedicineRow(index: number) {
    setMedicines((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }

  async function handleSubmit() {
    setError(null);
    if (medicines.length === 0 || hasInvalidMedicine) {
      setError(
        "Please fill medicine name, dosage, frequency, and valid duration days.",
      );
      return;
    }

    const payload = buildPrescriptionPayload(medicines, generalNotes);

    setIsSaving(true);
    try {
      const res = await fetch(`/api/doctor/appointments/${appointmentId}/prescription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to save prescription");
        return;
      }
      router.push("/doctor/appointments?tab=completed");
      router.refresh();
    } catch {
      setError("Failed to save prescription");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="font-montserrat text-sm text-[#333333]">Loading prescription...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {medicines.map((medicine, index) => (
          <div key={index} className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-montserrat text-sm font-semibold text-[#333333]">
                Medicine {index + 1}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => removeMedicineRow(index)}
                disabled={medicines.length === 1}
                className="cursor-pointer rounded-xl font-montserrat"
              >
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <MedicineNameAutocomplete
                value={medicine.name}
                onChange={(value) => updateMedicine(index, "name", value)}
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
              />
              <input
                type="text"
                placeholder="Dosage (e.g. 500mg)"
                value={medicine.dosage}
                onChange={(e) => updateMedicine(index, "dosage", e.target.value)}
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
              />
              <input
                type="text"
                placeholder="Frequency (e.g. Twice daily)"
                value={medicine.frequency}
                onChange={(e) => updateMedicine(index, "frequency", e.target.value)}
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
              />
              <input
                type="number"
                min={1}
                placeholder="Duration (days)"
                value={medicine.durationDays}
                onChange={(e) => updateMedicine(index, "durationDays", e.target.value)}
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
              />
            </div>

            <textarea
              placeholder="Instructions"
              value={medicine.instructions}
              onChange={(e) => updateMedicine(index, "instructions", e.target.value)}
              className="mt-3 min-h-[88px] w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
            />
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addMedicineRow}
          className="cursor-pointer rounded-xl font-montserrat"
        >
          Add Medicine
        </Button>
      </div>

      <div>
        <label className="mb-2 block font-montserrat text-sm font-medium text-[#333333]">
          General notes (optional)
        </label>
        <textarea
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
          className="min-h-[120px] w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
          placeholder="Additional advice for the patient..."
        />
      </div>

      {error && <p className="font-montserrat text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="cursor-pointer rounded-xl font-montserrat"
          onClick={() => void handleSubmit()}
          disabled={
            isSaving ||
            hasInvalidMedicine ||
            (isEditingExistingPrescription && !isDirty)
          }
        >
          {isSaving
            ? "Saving..."
            : isEditingExistingPrescription
              ? "Save changes"
              : "Save and complete"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer rounded-xl font-montserrat"
          onClick={() => router.push("/doctor/appointments?tab=completed")}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
