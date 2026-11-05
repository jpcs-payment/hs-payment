import lccLogo from "../../lcclogo.png";
import jpcsLogo from "../../jpcslogo/cropped_circle_image.png";
import ccteLogo from "../../ccte.png";
import silvercrestLogo from "../../silvercrest.png";
import ssgLogo from "../../ssg.png";

const logos = [
  { src: lccLogo, alt: "Lipa City Colleges" },
  { src: jpcsLogo, alt: "JPCS - LCC" },
  { src: ccteLogo, alt: "College of Computing and Technology Engineering" },
  { src: silvercrestLogo, alt: "LCC Silvercrest" },
  { src: ssgLogo, alt: "LCC Supreme Student Government" },
];

function LogoSet({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className="logo-marquee-set" aria-hidden={duplicate}>
      {logos.map((logo) => (
        <span className="logo-marquee-item" key={`${duplicate ? "duplicate-" : ""}${logo.alt}`}>
          <img src={logo.src} alt={duplicate ? "" : logo.alt} />
        </span>
      ))}
    </div>
  );
}

export function LogoMarquee() {
  return (
    <div className="logo-marquee" role="region" aria-label="JPCS and LCC partner organizations">
      <div className="logo-marquee-viewport mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <div className="logo-marquee-track">
          <LogoSet />
          <LogoSet duplicate />
        </div>
      </div>
    </div>
  );
}
