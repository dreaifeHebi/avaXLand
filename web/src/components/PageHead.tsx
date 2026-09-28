import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icons";

/** 每页顶上吸住的那一条：标题、可选的副标题和返回键 */
export function PageHead({ title, sub, back, children }: { title: ReactNode; sub?: ReactNode; back?: boolean; children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className={`page-head ${back ? "has-back" : ""}`}>
      {back && (
        <button className="icon-btn" aria-label="返回" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}>
          <Icon name="back" />
        </button>
      )}
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <span className="spacer" />
      {children}
    </div>
  );
}
