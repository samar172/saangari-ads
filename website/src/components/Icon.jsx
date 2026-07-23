import {
  Camera,
  Gem,
  Handshake,
  LineChart,
  Megaphone,
  MonitorSmartphone,
  Radar,
  Sparkles,
  Sprout,
  Users,
} from 'lucide-react'

// Explicit map keeps the bundle small — no dynamic imports of the whole set.
const ICONS = {
  Camera,
  Gem,
  Handshake,
  LineChart,
  Megaphone,
  MonitorSmartphone,
  Radar,
  Sparkles,
  Sprout,
  Users,
}

export default function Icon({ name, ...props }) {
  const Cmp = ICONS[name] ?? Sparkles
  return <Cmp {...props} />
}
