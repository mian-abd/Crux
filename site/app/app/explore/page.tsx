import type { Metadata } from "next";

import { ExploreContent } from "@/components/explore/explore-content";

export const metadata: Metadata = { title: "Explore" };

// The same gallery as the public /explore, inside the app shell so the
// sidebar stays.
export default function AppExplorePage() {
  return <ExploreContent shell="app" />;
}
