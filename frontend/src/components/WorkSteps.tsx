export const workSteps = [
  ['data', 'Datos'], ['visit', 'Visita'], ['photos', 'Fotos'],
  ['connections', 'Conexiones'], ['review', 'Revisar'], ['delivery', 'Entregar'],
] as const
export type WorkStep = typeof workSteps[number][0]
export type TourStep = Extract<WorkStep, 'photos' | 'connections' | 'review'>

export function WorkSteps({ current, onChange }: { current: WorkStep; onChange: (step: WorkStep) => void }) {
  return <div className="my-6 grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="Pasos del trabajo">
    {workSteps.map(([id, label], index) => <button key={id} aria-current={current === id ? 'step' : undefined}
      className={`!flex-col !gap-1 !px-2 !py-3 ${current === id ? '!border-accent !bg-accent/10 !text-accent' : '!bg-transparent !text-muted'}`}
      onClick={() => onChange(id)}><span className="text-[10px] opacity-60">{index + 1}</span><span className="text-xs">{label}</span></button>)}
  </div>
}
