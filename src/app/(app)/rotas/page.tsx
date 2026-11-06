import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { requireTenant } from "@/lib/supabase/server";
import { RouteForm } from "./route-form";
import { RouteItem } from "./route-item";

export const metadata: Metadata = { title: "Rotas" };

export default async function RotasPage() {
  const { supabase } = await requireTenant();
  const [{ data: routes }, { data: students }] = await Promise.all([
    supabase.from("routes").select("id, name, shift, schools, vehicle, capacity").is("archived_at", null).order("name"),
    supabase.from("students").select("route_id").eq("status", "ativo"),
  ]);
  const count = new Map<string, number>();
  for (const s of students ?? []) if (s.route_id) count.set(s.route_id, (count.get(s.route_id) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Rotas</h1>
      {(routes ?? []).length === 0 && (
        <p className="text-gray-700">Crie a sua primeira rota. Ela ajuda a organizar os alunos por turno e escola.</p>
      )}
      {(routes ?? []).map((r) => (
        <RouteItem
          key={r.id}
          route={{ id: r.id, name: r.name, shift: r.shift, schools: r.schools.join(", "), vehicle: r.vehicle ?? "", capacity: r.capacity ? String(r.capacity) : "" }}
          students={count.get(r.id) ?? 0}
        />
      ))}
      <Card>
        <h2 className="mb-3 text-lg font-bold">Nova rota</h2>
        <RouteForm submitLabel="Criar rota" />
      </Card>
    </div>
  );
}
