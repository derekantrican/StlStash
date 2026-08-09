import { Link } from "react-router-dom";
import { browseUrl } from "../paths.js";

export default function Breadcrumb({ crumbs }) {
  return (
    <nav className="breadcrumb">
      {crumbs.map((c, i) => {
        const segmentNames = crumbs.slice(1, i + 1).map((x) => x.name); // crumbs[0] is the root sentinel
        return (
          <span key={c.id}>
            {i > 0 && <span className="breadcrumb-sep">/</span>}
            {i === crumbs.length - 1 ? (
              <span>{c.name}</span>
            ) : (
              <Link to={browseUrl(segmentNames)}>{c.name}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
