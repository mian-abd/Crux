import type { Metadata } from "next";

import { ExploreContent } from "@/components/explore/explore-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "The sickle-cell change in the HBB gene, from one DNA letter to the protein, and a gallery of DNA, protein and small-molecule structures in 3D.",
};

// The public page. Signed-in visitors get the same content inside the app
// shell at /app/explore.
export default function ExplorePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <ExploreContent shell="site" />
      </main>
      <SiteFooter />
    </>
  );
}
