import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scoreBadgeVariant } from "@/lib/utils";
import type { Location } from "@/types";

export function LocationCard({ location, rank }: { location: Location; rank: number }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <div className="font-mono text-xs text-foreground-muted">
            {String(rank).padStart(2, "0")}
          </div>
          <h3 className="mt-1 text-lg font-semibold">{location.name}</h3>
          <p className="text-sm text-foreground-muted">
            {location.city}, {location.country}
          </p>
        </div>
        <Badge variant={scoreBadgeVariant(location.score)} className="font-mono">
          {location.score}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Mood fit
            </div>
            <p className="mt-1 text-sm">{location.mood_match}</p>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Era fit
            </div>
            <p className="mt-1 text-sm">{location.era_match}</p>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Permit
            </div>
            <p className="mt-1 text-sm">{location.permit_info}</p>
            {location.permit_url && (
              <a
                href={location.permit_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm text-foreground underline underline-offset-2 hover:text-foreground-muted"
              >
                Permit office →
              </a>
            )}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Est. daily cost
            </div>
            <p className="mt-1 text-sm">{location.avg_daily_cost}</p>
          </div>
        </div>

        {Array.isArray(location.past_productions) && location.past_productions.length > 0 && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Filmed here before
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {location.past_productions.map((p) => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Weather
            </div>
            <p className="mt-1 text-xs text-foreground-muted">{location.weather_notes}</p>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Logistics
            </div>
            <p className="mt-1 text-xs text-foreground-muted">{location.logistics_notes}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
