"use client";

import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import { SHIFT_LABEL } from "@/lib/labels";
import { archiveRoute } from "./actions";
import { RouteForm, type RouteValues } from "./route-form";

export function RouteItem({ route, students }: { route: Required<Pick<RouteValues, "id" | "name" | "shift">> & RouteValues; students: number }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <Card>
      {editing ? (
        <>
          <RouteForm initial={route} submitLabel="Salvar alterações" onDone={() => setEditing(false)} />
          <button type="button" onClick={() => setEditing(false)} className="mt-2 min-h-12 w-full font-semibold text-gray-700">
            Cancelar
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-lg font-bold">{route.name}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge>{SHIFT_LABEL[route.shift]}</Badge>
              <Badge tone="neutral">
                {students} {students === 1 ? "aluno" : "alunos"}
                {route.capacity ? ` de ${route.capacity} lugares` : ""}
              </Badge>
            </div>
            {route.schools && <p className="mt-2 text-gray-700">{route.schools}</p>}
            {route.vehicle && <p className="text-gray-700">{route.vehicle}</p>}
          </div>
          {confirming ? (
            <div className="rounded-xl bg-warn-bg p-3">
              <p className="font-medium text-warn">Arquivar a rota “{route.name}”? Ela some da lista, mas os alunos e cobranças não mudam.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirming(false)} className="min-h-12 rounded-full border-2 border-gray-300 bg-white font-semibold">
                  Não
                </button>
                <form action={archiveRoute}>
                  <input type="hidden" name="id" value={route.id} />
                  <button type="submit" className="min-h-12 w-full rounded-full bg-danger font-semibold text-white">
                    Sim, arquivar
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditing(true)} className="min-h-12 rounded-full border-2 border-brand-600 font-semibold text-brand-700">
                Editar
              </button>
              <button type="button" onClick={() => setConfirming(true)} className="min-h-12 rounded-full border-2 border-gray-300 font-semibold text-gray-700">
                Arquivar
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
