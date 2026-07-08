/* @ds-bundle: {"format":4,"namespace":"LoanStarDesignSystem_9cf112","components":[{"name":"Alert","sourcePath":"components/core/Alert.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"StatCard","sourcePath":"components/core/Card.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"Toast","sourcePath":"components/feedback/Modal.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/Modal.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/Modal.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Modal.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Input.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Input.jsx"},{"name":"Toggle","sourcePath":"components/forms/Input.jsx"},{"name":"DocumentChecklist","sourcePath":"components/loan/DocumentChecklist.jsx"},{"name":"SignatureConfirm","sourcePath":"components/loan/SignatureConfirm.jsx"},{"name":"StatusTimeline","sourcePath":"components/loan/StatusTimeline.jsx"},{"name":"Stepper","sourcePath":"components/loan/Stepper.jsx"},{"name":"AmortizationTable","sourcePath":"components/loan/Stepper.jsx"},{"name":"Sidebar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"TopBar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"PageHeader","sourcePath":"components/navigation/Sidebar.jsx"}],"sourceHashes":{"components/core/Alert.jsx":"eac6d241787b","components/core/Badge.jsx":"fecf590b8c20","components/core/Button.jsx":"071f7e6d6bd7","components/core/Card.jsx":"98ab01618049","components/feedback/Modal.jsx":"8de2eed8c454","components/forms/Input.jsx":"e4718eb3e8f4","components/loan/DocumentChecklist.jsx":"74850b907664","components/loan/SignatureConfirm.jsx":"747a796a6443","components/loan/StatusTimeline.jsx":"276a2e5177e8","components/loan/Stepper.jsx":"a39442ee7745","components/navigation/Sidebar.jsx":"dd35dd96f331","ui_kits/admin-dashboard/AdminDashboardApp.jsx":"f853ed1217df","ui_kits/auth/AuthApp.jsx":"68d2d250c574","ui_kits/borrower-portal/BorrowerPortalApp.jsx":"ded572ee5787","ui_kits/loan-application/LoanApplicationApp.jsx":"02b9da7d822e","ui_kits/staff-operations/StaffOperationsApp.jsx":"e2357f03f52a"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.LoanStarDesignSystem_9cf112 = window.LoanStarDesignSystem_9cf112 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Alert.jsx
try { (() => {
const VARIANTS = {
  success: {
    bg: 'var(--color-success-50)',
    border: 'var(--color-success-200)',
    title: 'var(--color-success-text-strong)',
    text: 'var(--color-success-700)'
  },
  warning: {
    bg: 'var(--color-warning-50)',
    border: 'var(--color-warning-200)',
    title: 'var(--color-warning-text-strong)',
    text: 'var(--color-warning-700)'
  },
  error: {
    bg: 'var(--color-danger-50)',
    border: 'var(--color-danger-200)',
    title: 'var(--color-danger-text-strong)',
    text: 'var(--color-danger-600)'
  },
  info: {
    bg: 'var(--color-info-50)',
    border: 'var(--color-info-200)',
    title: 'var(--color-info-text-strong)',
    text: 'var(--color-info-700)'
  }
};
function Alert({
  variant = 'info',
  title,
  children
}) {
  const v = VARIANTS[variant] || VARIANTS.info;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      background: v.bg,
      border: `1px solid ${v.border}`,
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: v.title,
      marginTop: 5,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: v.title,
      marginBottom: 2
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: v.text,
      lineHeight: 1.5
    }
  }, children)));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Alert.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
const STATUS_MAP = {
  registered: {
    bg: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-500)'
  },
  pending: {
    bg: 'var(--color-warning-50)',
    color: 'var(--color-warning-600)'
  },
  submitted: {
    bg: 'var(--color-info-50)',
    color: 'var(--color-info-600)'
  },
  approved: {
    bg: 'var(--color-success-50)',
    color: 'var(--color-success-600)'
  },
  active: {
    bg: 'var(--color-primary-50)',
    color: 'var(--color-primary-600)'
  },
  denied: {
    bg: 'var(--color-danger-50)',
    color: 'var(--color-danger-600)'
  },
  overdue: {
    bg: '#FFF7ED',
    color: '#EA580C'
  },
  closed: {
    bg: 'var(--color-neutral-50)',
    color: 'var(--color-neutral-500)'
  }
};
function Badge({
  children,
  status = 'active',
  dot = true,
  style
}) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.active;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: cfg.bg,
      color: cfg.color,
      padding: '5px 11px',
      borderRadius: 'var(--radius-sm)',
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '0.02em',
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: cfg.color,
      flexShrink: 0
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const VARIANTS = {
  primary: {
    bg: 'var(--color-primary-600)',
    hoverBg: 'var(--color-primary-700)',
    color: '#fff',
    border: 'none'
  },
  secondary: {
    bg: 'var(--color-primary-50)',
    hoverBg: 'var(--color-primary-100)',
    color: 'var(--color-primary-600)',
    border: 'none'
  },
  outline: {
    bg: 'transparent',
    hoverBg: 'var(--color-primary-50)',
    color: 'var(--color-primary-600)',
    border: '1.5px solid var(--color-primary-600)'
  },
  ghost: {
    bg: 'transparent',
    hoverBg: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-500)',
    border: 'none'
  },
  danger: {
    bg: 'var(--color-danger-600)',
    hoverBg: 'var(--color-danger-700)',
    color: '#fff',
    border: 'none'
  },
  success: {
    bg: 'var(--color-success-600)',
    hoverBg: 'var(--color-success-700)',
    color: '#fff',
    border: 'none'
  }
};
const SIZES = {
  sm: {
    height: 32,
    padding: '0 14px',
    fontSize: 12
  },
  md: {
    height: 40,
    padding: '0 20px',
    fontSize: 14
  },
  lg: {
    height: 48,
    padding: '0 28px',
    fontSize: 15
  }
};
function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  ...props
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const [hover, setHover] = React.useState(false);
  const isDisabled = disabled || loading;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: isDisabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      height: s.height,
      padding: s.padding,
      width: fullWidth ? '100%' : undefined,
      background: isDisabled ? 'var(--color-neutral-100)' : hover ? v.hoverBg : v.bg,
      color: isDisabled ? 'var(--color-neutral-300)' : v.color,
      border: v.border,
      borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-body)',
      fontSize: s.fontSize,
      fontWeight: 600,
      letterSpacing: '0.01em',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      transition: 'background 150ms',
      ...style
    }
  }, props), loading && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.4)',
      borderTopColor: 'currentColor',
      animation: 'ls-spin 0.8s linear infinite',
      flexShrink: 0
    }
  }), children, /*#__PURE__*/React.createElement("style", null, '@keyframes ls-spin{to{transform:rotate(360deg)}}'));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  children,
  variant = 'base',
  style,
  ...props
}) {
  const base = {
    borderRadius: 'var(--radius-md)',
    padding: 24,
    fontFamily: 'var(--font-body)'
  };
  const variants = {
    base: {
      background: 'var(--color-neutral-0)',
      border: '1px solid var(--color-neutral-200)',
      boxShadow: 'var(--shadow-sm)'
    },
    highlight: {
      background: 'var(--color-primary-50)',
      border: '1px solid var(--color-primary-200)',
      borderLeft: '4px solid var(--color-primary-600)'
    },
    warning: {
      background: 'var(--color-warning-50)',
      border: '1px solid var(--color-warning-200)',
      borderLeft: '4px solid var(--color-warning-600)'
    },
    danger: {
      background: 'var(--color-danger-50)',
      border: '1px solid var(--color-danger-200)',
      borderLeft: '4px solid var(--color-danger-600)'
    },
    gradient: {
      background: 'linear-gradient(135deg,#1E3A8A 0%,#1A56DB 100%)',
      color: '#fff'
    }
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      ...base,
      ...(variants[variant] || variants.base),
      ...style
    }
  }, props), children);
}

/** Small KPI/stat card: label + big number + trend badge. */
function StatCard({
  label,
  value,
  trend,
  trendPositive = true,
  sub
}) {
  return /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-neutral-500)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: 16
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      fontWeight: 700,
      color: 'var(--color-neutral-900)',
      letterSpacing: '-1px',
      fontVariantNumeric: 'tabular-nums',
      marginBottom: 10,
      lineHeight: 1
    }
  }, value), (trend || sub) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, trend && /*#__PURE__*/React.createElement("span", {
    style: {
      background: trendPositive ? 'var(--color-success-50)' : 'var(--color-danger-50)',
      color: trendPositive ? 'var(--color-success-600)' : 'var(--color-danger-600)',
      fontSize: 11,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 'var(--radius-xs)'
    }
  }, trend), sub && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--color-neutral-400)'
    }
  }, sub)));
}
Object.assign(__ds_scope, { Card, StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 420
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,42,0.4)',
      backdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 400
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: '#fff',
      borderRadius: 'var(--radius-md)',
      width,
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 24px',
      borderBottom: '1px solid var(--color-neutral-100)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--color-neutral-900)'
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      background: 'var(--color-neutral-50)',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      cursor: 'pointer',
      fontSize: 18,
      color: 'var(--color-neutral-400)'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 24px',
      borderTop: '1px solid var(--color-neutral-100)',
      display: 'flex',
      gap: 8
    }
  }, footer)));
}
function Toast({
  message,
  variant = 'default'
}) {
  const dark = variant === 'default';
  const dot = variant === 'warning' ? 'var(--color-warning-600)' : 'var(--color-success-600)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: dark ? 'var(--color-neutral-900)' : '#fff',
      color: dark ? '#fff' : 'var(--color-neutral-700)',
      border: dark ? 'none' : '1px solid var(--color-warning-200)',
      padding: '11px 14px',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)',
      minWidth: 280
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: dot,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      flex: 1
    }
  }, message), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      color: dark ? 'var(--color-neutral-500)' : 'var(--color-neutral-400)',
      cursor: 'pointer',
      lineHeight: 1
    }
  }, "\xD7"));
}
function ProgressBar({
  label,
  value,
  total,
  color = 'var(--color-primary-600)'
}) {
  const pct = total ? Math.round(value / total * 100) : value;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-neutral-700)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--color-neutral-900)'
    }
  }, pct, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      background: 'var(--color-neutral-100)',
      borderRadius: 3,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: `${pct}%`,
      background: color,
      borderRadius: 3
    }
  })));
}
function EmptyState({
  title,
  description,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--color-neutral-200)',
      borderRadius: 'var(--radius-md)',
      padding: '36px 20px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      background: 'var(--color-neutral-100)',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 16px'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "26",
    height: "26",
    viewBox: "0 0 26 26",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "5",
    width: "20",
    height: "16",
    rx: "2",
    stroke: "#CBD5E1",
    strokeWidth: "1.8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 11h10M8 15h6",
    stroke: "#CBD5E1",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--color-neutral-700)',
      marginBottom: 6
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--color-neutral-400)',
      lineHeight: 1.6,
      marginBottom: 20,
      maxWidth: 260,
      marginLeft: 'auto',
      marginRight: 'auto'
    }
  }, description), action);
}
function Skeleton({
  width = '100%',
  height = 13
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 3,
      background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EEF4 50%,#F1F5F9 75%)',
      backgroundSize: '400px 100%',
      animation: 'ls-shimmer 1.5s infinite'
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes ls-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}'));
}
Object.assign(__ds_scope, { Modal, Toast, ProgressBar, EmptyState, Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  required,
  error,
  helper,
  prefix,
  style,
  inputStyle,
  ...props
}) {
  const [focused, setFocused] = React.useState(false);
  const borderColor = error ? 'var(--color-danger-600)' : focused ? 'var(--color-primary-600)' : 'var(--color-neutral-300)';
  return /*#__PURE__*/React.createElement("div", {
    style: style
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-neutral-700)',
      marginBottom: 6
    }
  }, label, " ", required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-danger-600)'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, prefix && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 13,
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--color-neutral-500)',
      pointerEvents: 'none'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    onFocus: e => {
      setFocused(true);
      props.onFocus?.(e);
    },
    onBlur: e => {
      setFocused(false);
      props.onBlur?.(e);
    },
    style: {
      width: '100%',
      height: 40,
      padding: prefix ? '0 14px 0 30px' : '0 14px',
      background: error ? '#FEF2F2' : '#fff',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      color: 'var(--color-neutral-900)',
      outline: 'none',
      boxShadow: focused ? '0 0 0 3px rgba(26,86,219,0.1)' : 'none',
      ...inputStyle
    }
  }, props))), error ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-danger-600)',
      fontWeight: 500,
      marginTop: 5
    }
  }, error) : helper ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-neutral-400)',
      marginTop: 5
    }
  }, helper) : null);
}
function Select({
  label,
  children,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: style
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-neutral-700)',
      marginBottom: 6
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    style: {
      width: '100%',
      height: 40,
      padding: '0 40px 0 14px',
      background: '#fff',
      border: '1.5px solid var(--color-neutral-300)',
      borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      color: 'var(--color-neutral-900)',
      outline: 'none',
      appearance: 'none',
      cursor: 'pointer'
    }
  }, props), children), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none',
      color: 'var(--color-neutral-500)'
    }
  }, "\u25BE")));
}
function Checkbox({
  label,
  checked,
  onChange,
  disabled
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => !disabled && onChange?.(!checked),
    style: {
      width: 18,
      height: 18,
      borderRadius: 3,
      flexShrink: 0,
      marginTop: 1,
      background: checked ? 'var(--color-primary-600)' : '#fff',
      border: checked ? 'none' : '1.5px solid var(--color-neutral-300)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, checked && /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "9",
    viewBox: "0 0 11 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 4.5L4 7.5L10 1.5",
    stroke: "white",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--color-neutral-700)',
      lineHeight: 1.55
    }
  }, label));
}
function Toggle({
  checked,
  onChange,
  label,
  sub
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12
    }
  }, (label || sub) && /*#__PURE__*/React.createElement("div", null, label && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-neutral-700)'
    }
  }, label), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-neutral-400)'
    }
  }, sub)), /*#__PURE__*/React.createElement("div", {
    onClick: () => onChange?.(!checked),
    style: {
      width: 44,
      height: 24,
      borderRadius: 12,
      position: 'relative',
      cursor: 'pointer',
      flexShrink: 0,
      background: checked ? 'var(--color-primary-600)' : 'var(--color-neutral-200)',
      transition: 'background 150ms'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 18,
      background: '#fff',
      borderRadius: '50%',
      position: 'absolute',
      top: 3,
      left: checked ? 23 : 3,
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      transition: 'left 150ms'
    }
  })));
}
Object.assign(__ds_scope, { Input, Select, Checkbox, Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/loan/DocumentChecklist.jsx
try { (() => {
/** Per-document upload/verify row list. Restyled equivalent of the real DocumentChecklist.tsx
 * (borrower + agent + CSA/CIG views all read the same checklist shape). */
function DocumentChecklist({
  documents,
  flagsOnly = false,
  onUpload
}) {
  if (flagsOnly) {
    const complete = documents.every(d => d.status === 'confirmed' || d.status === 'uploaded');
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 12,
        fontWeight: 700,
        background: complete ? 'var(--color-success-50)' : 'var(--color-warning-50)',
        color: complete ? 'var(--color-success-600)' : 'var(--color-warning-600)'
      }
    }, complete ? 'Complete' : 'Incomplete');
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)'
    }
  }, documents.map((doc, i) => /*#__PURE__*/React.createElement("div", {
    key: doc.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 0',
      borderBottom: i < documents.length - 1 ? '1px solid var(--color-neutral-100)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 4,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: doc.status === 'pending' ? 'var(--color-neutral-100)' : 'var(--color-success-50)'
    }
  }, doc.status !== 'pending' && /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "9",
    viewBox: "0 0 11 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 4.5L4 7.5L10 1.5",
    stroke: "var(--color-success-600)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-neutral-700)'
    }
  }, doc.name), doc.filename && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--color-neutral-400)'
    }
  }, doc.filename)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'capitalize',
      color: doc.status === 'pending' ? 'var(--color-neutral-400)' : doc.status === 'confirmed' ? 'var(--color-success-600)' : 'var(--color-primary-600)'
    }
  }, doc.status), /*#__PURE__*/React.createElement("button", {
    onClick: () => onUpload?.(doc),
    style: {
      height: 30,
      padding: '0 12px',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      background: doc.status === 'pending' ? 'var(--color-primary-50)' : 'var(--color-neutral-100)',
      color: doc.status === 'pending' ? 'var(--color-primary-600)' : 'var(--color-neutral-500)'
    }
  }, doc.status === 'pending' ? 'Upload' : 'Replace'))));
}
Object.assign(__ds_scope, { DocumentChecklist });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/loan/DocumentChecklist.jsx", error: String((e && e.message) || e) }); }

// components/loan/SignatureConfirm.jsx
try { (() => {
/** Sign-a-document card + confirmation modal. Restyled equivalent of the real SignatureConfirm.tsx. */
function SignatureConfirm({
  docName,
  docType,
  onSign,
  signed = false,
  signedAt
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  if (signed) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        border: '1px solid var(--color-success-200)',
        borderLeft: '4px solid var(--color-success-600)',
        borderRadius: 'var(--radius-md)',
        padding: 20
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--color-success-600)'
      }
    }, /*#__PURE__*/React.createElement("span", null, "\u2713"), " Signed on ", signedAt));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--color-neutral-200)',
      borderLeft: '4px solid var(--color-primary-600)',
      borderRadius: 'var(--radius-md)',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--color-neutral-900)'
    }
  }, docName), docType && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      background: 'var(--color-primary-50)',
      color: 'var(--color-primary-600)',
      padding: '2px 8px',
      borderRadius: 3
    }
  }, docType)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--color-neutral-500)',
      marginBottom: 16
    }
  }, "By confirming, you acknowledge you have reviewed this document in full."), /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmOpen(true),
    style: {
      width: '100%',
      height: 44,
      background: 'var(--color-primary-600)',
      color: '#fff',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "I have reviewed this document \u2014 Sign & Confirm"), /*#__PURE__*/React.createElement(__ds_scope.Modal, {
    open: confirmOpen,
    onClose: () => setConfirmOpen(false),
    title: `Confirm signature`,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: () => setConfirmOpen(false),
      style: {
        flex: 1,
        height: 40,
        background: '#fff',
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 4,
        cursor: 'pointer'
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setConfirmOpen(false);
        onSign?.();
      },
      style: {
        flex: 1,
        height: 40,
        background: 'var(--color-primary-600)',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        fontWeight: 600,
        cursor: 'pointer'
      }
    }, "Yes, sign document"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--color-neutral-500)'
    }
  }, "Confirm signature on: ", /*#__PURE__*/React.createElement("strong", null, docName), ". This cannot be undone.")));
}
Object.assign(__ds_scope, { SignatureConfirm });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/loan/SignatureConfirm.jsx", error: String((e && e.message) || e) }); }

// components/loan/StatusTimeline.jsx
try { (() => {
/** Horizontal (desktop) status stepper — past/current/future/denied states. Mirrors the real
 * StatusTimeline.tsx component's role (borrower application progress) restyled to the brand. */
function StatusTimeline({
  steps,
  currentIndex,
  denied = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      fontFamily: 'var(--font-body)'
    }
  }, steps.map((label, i) => {
    const past = i < currentIndex;
    const current = i === currentIndex;
    const isDenied = denied && current;
    const circleBg = isDenied ? 'var(--color-danger-600)' : past ? 'var(--color-neutral-900)' : current ? '#fff' : 'var(--color-neutral-100)';
    const circleBorder = isDenied ? 'var(--color-danger-600)' : past || current ? 'var(--color-neutral-900)' : 'var(--color-neutral-200)';
    const circleColor = isDenied || past ? '#fff' : current ? 'var(--color-primary-600)' : 'var(--color-neutral-400)';
    const labelColor = isDenied ? 'var(--color-danger-700)' : past ? 'var(--color-neutral-700)' : current ? 'var(--color-primary-700)' : 'var(--color-neutral-400)';
    return /*#__PURE__*/React.createElement("div", {
      key: label,
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        minWidth: 80,
        position: 'relative'
      }
    }, i > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 13,
        left: 0,
        width: '50%',
        height: 2,
        background: past || current ? 'var(--color-neutral-900)' : 'var(--color-neutral-200)'
      }
    }), i < steps.length - 1 && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 13,
        left: '50%',
        right: 0,
        height: 2,
        background: past ? 'var(--color-neutral-900)' : 'var(--color-neutral-200)'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: circleBg,
        border: `2px solid ${circleBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        boxShadow: current && !isDenied ? '0 0 0 3px rgba(26,86,219,0.15)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: circleColor
      }
    }, isDenied ? '✕' : past ? '✓' : i + 1)), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        marginTop: 8,
        padding: '0 4px',
        fontSize: 11,
        fontWeight: current ? 700 : 500,
        color: labelColor,
        lineHeight: 1.3,
        maxWidth: 90
      }
    }, label));
  }));
}
Object.assign(__ds_scope, { StatusTimeline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/loan/StatusTimeline.jsx", error: String((e && e.message) || e) }); }

// components/loan/Stepper.jsx
try { (() => {
/** Clickable circle+label stepper used on the Loan Application flow header. */
function Stepper({
  steps,
  currentIndex,
  onStepClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      fontFamily: 'var(--font-body)'
    }
  }, steps.map((label, i) => {
    const done = i < currentIndex;
    const active = i === currentIndex;
    return /*#__PURE__*/React.createElement("div", {
      key: label,
      onClick: () => onStepClick?.(i),
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        minWidth: 90,
        position: 'relative',
        cursor: onStepClick ? 'pointer' : 'default'
      }
    }, i > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 17,
        left: 0,
        width: '50%',
        height: 2,
        background: done || active ? 'var(--color-primary-600)' : 'var(--color-neutral-200)'
      }
    }), i < steps.length - 1 && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 17,
        left: '50%',
        right: 0,
        height: 2,
        background: done ? 'var(--color-primary-600)' : 'var(--color-neutral-200)'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: '50%',
        zIndex: 1,
        background: done ? 'var(--color-primary-600)' : active ? '#fff' : 'var(--color-neutral-50)',
        border: `2px solid ${done || active ? 'var(--color-primary-600)' : 'var(--color-neutral-200)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active ? '0 0 0 4px rgba(26,86,219,0.15)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: done ? '#fff' : active ? 'var(--color-primary-600)' : 'var(--color-neutral-300)'
      }
    }, done ? '✓' : i + 1)), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        marginTop: 10,
        fontSize: 11,
        fontWeight: active ? 700 : done ? 600 : 400,
        color: active ? 'var(--color-neutral-900)' : done ? 'var(--color-neutral-700)' : 'var(--color-neutral-300)',
        maxWidth: 100
      }
    }, label));
  }));
}

/** Amortization schedule table with per-row status tinting. */
function AmortizationTable({
  rows
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--color-neutral-200)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '56px 1fr 110px 110px 110px 90px',
      background: 'var(--color-neutral-50)',
      borderBottom: '1px solid var(--color-neutral-200)',
      padding: '10px 16px'
    }
  }, ['#', 'Due Date', 'Principal', 'Interest', 'Payment', 'Status'].map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--color-neutral-500)',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      textAlign: i >= 2 && i <= 4 ? 'right' : 'left'
    }
  }, h))), rows.map(r => {
    const bg = r.status === 'paid' ? '#FAFFFE' : r.status === 'due' ? '#FFFBEB' : '#fff';
    const badge = r.status === 'paid' ? {
      bg: 'var(--color-success-50)',
      color: 'var(--color-success-600)'
    } : r.status === 'due' ? {
      bg: 'var(--color-warning-50)',
      color: 'var(--color-warning-600)'
    } : {
      bg: 'var(--color-neutral-100)',
      color: 'var(--color-neutral-500)'
    };
    return /*#__PURE__*/React.createElement("div", {
      key: r.num,
      style: {
        display: 'grid',
        gridTemplateColumns: '56px 1fr 110px 110px 110px 90px',
        padding: '11px 16px',
        borderBottom: '1px solid var(--color-neutral-50)',
        alignItems: 'center',
        background: bg
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--color-neutral-400)',
        fontVariantNumeric: 'tabular-nums'
      }
    }, r.num), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: 'var(--color-neutral-700)'
      }
    }, r.dueDate), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        textAlign: 'right',
        color: 'var(--color-neutral-700)',
        fontVariantNumeric: 'tabular-nums'
      }
    }, r.principal), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        textAlign: 'right',
        color: 'var(--color-neutral-500)',
        fontVariantNumeric: 'tabular-nums'
      }
    }, r.interest), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'right',
        color: 'var(--color-neutral-700)',
        fontVariantNumeric: 'tabular-nums'
      }
    }, r.payment), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        background: badge.bg,
        color: badge.color,
        fontSize: 10,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 3,
        textTransform: 'capitalize'
      }
    }, r.status)));
  }));
}
Object.assign(__ds_scope, { Stepper, AmortizationTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/loan/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
/** Generic branded sidebar used across all staff/admin/borrower portals (width varies 224–248px in the real screens). */
function Sidebar({
  items,
  activeId,
  onNavigate,
  footer,
  subtitle = 'My Account',
  width = 228
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width,
      flexShrink: 0,
      background: '#fff',
      borderRight: '1px solid var(--color-neutral-200)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 20px 16px',
      borderBottom: '1px solid var(--color-neutral-100)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      background: 'linear-gradient(135deg,#1A56DB,#1444B8)',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z",
    fill: "white"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: 'var(--color-neutral-900)',
      letterSpacing: '-0.4px'
    }
  }, "LoanStar"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--color-neutral-400)',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase'
    }
  }, subtitle)))), /*#__PURE__*/React.createElement("nav", {
    style: {
      padding: 10,
      flex: 1
    }
  }, items.map(item => {
    const active = item.id === activeId;
    return /*#__PURE__*/React.createElement("div", {
      key: item.id,
      onClick: () => onNavigate?.(item),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 10px',
        borderRadius: 5,
        cursor: 'pointer',
        background: active ? 'var(--color-primary-50)' : 'transparent',
        marginBottom: 1
      }
    }, item.icon && /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 14 14",
      fill: "none",
      style: {
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: item.icon,
      stroke: active ? 'var(--color-primary-600)' : 'var(--color-neutral-600)',
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--color-primary-600)' : 'var(--color-neutral-600)'
      }
    }, item.label));
  })), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      borderTop: '1px solid var(--color-neutral-100)',
      flexShrink: 0
    }
  }, footer));
}

/** Sticky top bar: title/subtitle left, actions (search, notification bell, CTA) right. */
function TopBar({
  title,
  subtitle,
  actions
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 60,
      background: '#fff',
      borderBottom: '1px solid var(--color-neutral-200)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: 'var(--color-neutral-900)',
      letterSpacing: '-0.3px'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-neutral-400)'
    }
  }, subtitle)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, actions));
}

/** Page-level header used inside content areas: back arrow (optional) + title + description + actions. */
function PageHeader({
  title,
  description,
  actions,
  onBack
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, onBack && /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-neutral-500)',
      fontSize: 13,
      fontWeight: 500,
      marginBottom: 8,
      padding: 0
    }
  }, "\u2190 Back"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 24,
      fontWeight: 700,
      letterSpacing: '-0.5px',
      color: 'var(--color-neutral-900)',
      margin: 0
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: 'var(--color-neutral-500)'
    }
  }, description)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, actions));
}
Object.assign(__ds_scope, { Sidebar, TopBar, PageHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin-dashboard/AdminDashboardApp.jsx
try { (() => {
function AdminDashboardApp() {
  const [activeTab, setActiveTab] = React.useState('all');
  const kpis = [{
    label: 'Active Loans',
    value: '1,247',
    trend: '↑ +12%',
    up: true,
    change: 'vs last month'
  }, {
    label: 'Disbursed (Jun)',
    value: '₱24.3M',
    trend: '↑ +8.3%',
    up: true,
    change: 'vs Jun 2025'
  }, {
    label: 'Collection Rate',
    value: '94.2%',
    trend: '↑ +1.2pp',
    up: true,
    change: 'vs last month'
  }, {
    label: 'Overdue Loans',
    value: '73',
    trend: '↓ −5',
    up: false,
    change: 'vs last month'
  }];
  const donutData = [{
    label: 'Active',
    count: 856,
    color: '#1A56DB',
    pct: '68.6%'
  }, {
    label: 'Pending',
    count: 218,
    color: '#D97706',
    pct: '17.5%'
  }, {
    label: 'Overdue',
    count: 73,
    color: '#DC2626',
    pct: '5.8%'
  }, {
    label: 'Closed',
    count: 100,
    color: '#CBD5E1',
    pct: '8.0%'
  }];
  let cum = 0;
  const gradParts = donutData.map(d => {
    const deg = d.count / 1247 * 360;
    const part = `${d.color} ${cum.toFixed(1)}deg ${(cum + deg).toFixed(1)}deg`;
    cum += deg;
    return part;
  });
  const pipeline = [{
    stage: 'Intake & Verification',
    count: 48,
    role: 'CSA',
    color: '#1A56DB'
  }, {
    stage: 'Credit Investigation',
    count: 32,
    role: 'CIG',
    color: '#0EA5E9'
  }, {
    stage: 'Committee Review',
    count: 24,
    role: 'Committee',
    color: '#D97706'
  }, {
    stage: 'Negotiation & Docs',
    count: 18,
    role: 'LRA',
    color: '#059669'
  }, {
    stage: 'Briefing & Release',
    count: 12,
    role: 'LRA',
    color: '#8B5CF6'
  }];
  const allApps = [{
    id: 'LN-2026-00248',
    name: 'Maria Santos',
    amount: '₱80,000',
    stage: 'Committee',
    date: 'Jun 15',
    status: 'pending'
  }, {
    id: 'LN-2026-00247',
    name: 'Jose Reyes',
    amount: '₱150,000',
    stage: 'Release',
    date: 'Jun 15',
    status: 'approved'
  }, {
    id: 'LN-2026-00246',
    name: 'Ana Garcia',
    amount: '₱50,000',
    stage: 'CIG',
    date: 'Jun 14',
    status: 'active'
  }, {
    id: 'LN-2026-00245',
    name: 'Pedro Cruz',
    amount: '₱200,000',
    stage: 'Intake',
    date: 'Jun 14',
    status: 'pending'
  }, {
    id: 'LN-2026-00244',
    name: 'Rosa Mendoza',
    amount: '₱75,000',
    stage: 'Monitoring',
    date: 'Jun 13',
    status: 'active'
  }, {
    id: 'LN-2026-00241',
    name: 'Carlos Aquino',
    amount: '₱45,000',
    stage: 'CIG',
    date: 'Jun 11',
    status: 'overdue'
  }];
  const statusCfg = {
    pending: ['#FFFBEB', '#D97706', 'Pending'],
    approved: ['#ECFDF5', '#059669', 'Approved'],
    active: ['#EFF6FF', '#1A56DB', 'Active'],
    overdue: ['#FEF2F2', '#DC2626', 'Overdue']
  };
  const filtered = activeTab === 'all' ? allApps : allApps.filter(a => a.status === activeTab);
  const avatarColors = ['#1A56DB', '#059669', '#D97706', '#8B5CF6', '#DC2626', '#0EA5E9'];
  const navDefs = [{
    id: 'dashboard',
    label: 'Dashboard'
  }, {
    id: 'applications',
    label: 'Applications'
  }, {
    id: 'active-loans',
    label: 'Active Loans'
  }, {
    id: 'collections',
    label: 'Collections'
  }, {
    id: 'borrowers',
    label: 'Borrowers'
  }, {
    id: 'reports',
    label: 'Reports'
  }, {
    id: 'overdue',
    label: 'Overdue',
    badge: '73'
  }];
  const [activeNav, setActiveNav] = React.useState('dashboard');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 760,
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
      background: '#F8FAFC'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 216,
      flexShrink: 0,
      background: '#fff',
      borderRight: '1px solid #E2E8F0',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 18px 14px',
      borderBottom: '1px solid #F1F5F9'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      background: 'linear-gradient(135deg,#1A56DB,#1444B8)',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z",
    fill: "white"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: '#0F172A'
    }
  }, "LoanStar"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#94A3B8',
      fontWeight: 600,
      textTransform: 'uppercase'
    }
  }, "Admin Portal")))), /*#__PURE__*/React.createElement("nav", {
    style: {
      padding: 10,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: '#94A3B8',
      padding: '6px 8px'
    }
  }, "Main Menu"), navDefs.map(item => {
    const active = activeNav === item.id;
    return /*#__PURE__*/React.createElement("div", {
      key: item.id,
      onClick: () => setActiveNav(item.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 8px',
        borderRadius: 5,
        cursor: 'pointer',
        background: active ? '#EFF6FF' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? '#1A56DB' : '#475569',
        flex: 1
      }
    }, item.label), item.badge && /*#__PURE__*/React.createElement("span", {
      style: {
        background: '#FEF2F2',
        color: '#DC2626',
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: 9
      }
    }, item.badge));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 14px',
      borderTop: '1px solid #F1F5F9',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#1A56DB,#0EA5E9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 700,
      color: '#fff'
    }
  }, "M"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: '#0F172A'
    }
  }, "Maria Santos"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#94A3B8'
    }
  }, "Branch Manager")))), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      overflowY: 'auto',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      height: 58,
      background: '#fff',
      borderBottom: '1px solid #E2E8F0',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      padding: '0 26px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Dashboard"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#94A3B8'
    }
  }, "June 16, 2026 \xB7 Good morning, Maria")), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search loans, borrowers\u2026",
    style: {
      width: 200,
      height: 34,
      padding: '0 12px',
      background: '#F8FAFC',
      border: '1.5px solid #E2E8F0',
      borderRadius: 4,
      fontSize: 13
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '22px 26px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 14,
      marginBottom: 20
    }
  }, kpis.map(k => /*#__PURE__*/React.createElement("div", {
    key: k.label,
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 18,
      boxShadow: '0 1px 3px rgba(15,23,42,0.05)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: 12
    }
  }, k.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 700,
      color: '#0F172A',
      letterSpacing: '-1px',
      fontVariantNumeric: 'tabular-nums',
      marginBottom: 8
    }
  }, k.value), /*#__PURE__*/React.createElement("span", {
    style: {
      background: k.up ? '#ECFDF5' : '#FEF2F2',
      color: k.up ? '#059669' : '#DC2626',
      fontSize: 11,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 3
    }
  }, k.trend), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: '#94A3B8',
      marginLeft: 8
    }
  }, k.change)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.6fr',
      gap: 14,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#0F172A',
      marginBottom: 4
    }
  }, "Loan Status Mix"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#94A3B8',
      marginBottom: 16
    }
  }, "1,247 total loans"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 120,
      height: 120,
      borderRadius: '50%',
      background: `conic-gradient(${gradParts.join(', ')})`,
      flexShrink: 0,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 24,
      background: '#fff',
      borderRadius: '50%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "1,247"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: '#94A3B8'
    }
  }, "Total"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      flex: 1
    }
  }, donutData.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 2,
      background: d.color
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: '#334155'
    }
  }, d.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#94A3B8'
    }
  }, d.pct)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, d.count)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#0F172A',
      marginBottom: 4
    }
  }, "Active Pipeline"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#94A3B8',
      marginBottom: 18
    }
  }, "Applications currently in processing stages"), pipeline.map(row => /*#__PURE__*/React.createElement("div", {
    key: row.stage,
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: row.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: '#334155'
    }
  }, row.stage)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: '#94A3B8',
      background: '#F1F5F9',
      padding: '2px 7px',
      borderRadius: 3,
      fontWeight: 600
    }
  }, row.role), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#0F172A',
      minWidth: 24,
      textAlign: 'right'
    }
  }, row.count))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      background: '#F1F5F9',
      borderRadius: 3,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: `${Math.round(row.count / 60 * 100)}%`,
      background: row.color,
      borderRadius: 3
    }
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px',
      borderBottom: '1px solid #E2E8F0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Recent Applications"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2,
      background: '#F1F5F9',
      padding: 3,
      borderRadius: 5
    }
  }, ['all', 'pending', 'active', 'overdue'].map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => setActiveTab(t),
    style: {
      height: 28,
      padding: '0 12px',
      border: 'none',
      borderRadius: 3,
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      textTransform: 'capitalize',
      background: activeTab === t ? '#fff' : 'transparent',
      color: activeTab === t ? '#0F172A' : '#64748B'
    }
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '130px 1fr 100px 100px 80px 90px',
      padding: '8px 18px',
      background: '#F8FAFC',
      borderBottom: '1px solid #E2E8F0'
    }
  }, ['Loan ID', 'Borrower', 'Amount', 'Stage', 'Date', 'Status'].map(h => /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, h))), filtered.map((row, i) => {
    const [bg, color, label] = statusCfg[row.status];
    return /*#__PURE__*/React.createElement("div", {
      key: row.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '130px 1fr 100px 100px 80px 90px',
        padding: '11px 18px',
        borderBottom: '1px solid #F8FAFC',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 600,
        color: '#334155',
        fontFamily: 'var(--font-mono)'
      }
    }, row.id), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: avatarColors[i % avatarColors.length],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        color: '#fff'
      }
    }, row.name.split(' ').map(w => w[0]).join('')), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: '#334155'
      }
    }, row.name)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: '#0F172A'
      }
    }, row.amount), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: '#64748B'
      }
    }, row.stage), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: '#94A3B8'
      }
    }, row.date), /*#__PURE__*/React.createElement("span", {
      style: {
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 9px',
        borderRadius: 3,
        width: 'fit-content'
      }
    }, label));
  })))));
}
window.AdminDashboardApp = AdminDashboardApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin-dashboard/AdminDashboardApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auth/AuthApp.jsx
try { (() => {
function AuthApp() {
  const [role, setRole] = React.useState('borrower');
  const [step, setStep] = React.useState('login');
  const [email, setEmail] = React.useState('juan.delacruz@email.com');
  const [password, setPassword] = React.useState('password123');
  const [showPw, setShowPw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [resend, setResend] = React.useState(45);
  React.useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => setResend(s => s <= 1 ? 0 : s - 1), 1000);
    return () => clearInterval(t);
  }, [step]);
  const roleLabels = {
    borrower: 'Borrower',
    staff: 'Staff',
    admin: 'Admin'
  };
  const masked = email.replace(/^(.{2})(.*)(@.+)$/, (_, a, b, c) => a + b.replace(/./g, '•') + c);
  const otp = ['4', '7', '2', '', '', ''];
  function submit() {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep('otp');
      setResend(45);
    }, 1000);
  }
  function verify() {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      alert(`Would navigate to the ${roleLabels[role]} portal.`);
    }, 800);
  }
  const tab = r => ({
    background: role === r ? '#FFFFFF' : 'transparent',
    color: role === r ? '#0F172A' : '#64748B',
    boxShadow: role === r ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: 640,
      fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 400,
      flexShrink: 0,
      background: 'linear-gradient(155deg,#1E2F5E 0%,#1A56DB 100%)',
      padding: '48px 44px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -100,
      right: -100,
      width: 360,
      height: 360,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.04)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 44
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      background: 'rgba(255,255,255,0.15)',
      borderRadius: 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2L14.8 9.2 22 10.3 16.5 15.6 18 22 12 18.5 6 22 7.5 15.6 2 10.3 9.2 9.2z",
    fill: "white"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: '#fff',
      letterSpacing: '-0.5px'
    }
  }, "LoanStar"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.5)',
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase'
    }
  }, "Lending System"))), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 34,
      fontWeight: 800,
      color: '#fff',
      letterSpacing: '-1.1px',
      lineHeight: 1.1,
      marginBottom: 14
    }
  }, "Smart loans,", /*#__PURE__*/React.createElement("br", null), "simpler lives."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.6)',
      lineHeight: 1.75,
      maxWidth: 280
    }
  }, "A trusted platform for borrowers and lending professionals \u2014 from application to collection.")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      marginBottom: 24
    }
  }, [['1,247', 'Active Loans'], ['₱124M', 'Disbursed'], ['94.2%', 'Collection Rate'], ['24hr', 'Processing']].map(([v, l]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      background: 'rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 700,
      color: '#fff',
      letterSpacing: '-0.8px'
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.55)',
      marginTop: 3
    }
  }, l)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 28px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 380
    }
  }, step === 'login' ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 26,
      fontWeight: 800,
      color: '#0F172A',
      letterSpacing: '-0.6px',
      marginBottom: 6
    }
  }, "Welcome back"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: '#64748B'
    }
  }, "Sign in to your LoanStar account")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 3,
      background: '#E2E8F0',
      padding: 3,
      borderRadius: 6,
      marginBottom: 24
    }
  }, ['borrower', 'staff', 'admin'].map(r => /*#__PURE__*/React.createElement("button", {
    key: r,
    onClick: () => setRole(r),
    style: {
      flex: 1,
      height: 34,
      border: 'none',
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      ...tab(r)
    }
  }, roleLabels[r]))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: '#334155',
      marginBottom: 6
    }
  }, "Email Address"), /*#__PURE__*/React.createElement("input", {
    value: email,
    onChange: e => setEmail(e.target.value),
    style: {
      width: '100%',
      height: 42,
      padding: '0 14px',
      border: '1.5px solid #CBD5E1',
      borderRadius: 4,
      fontSize: 14,
      outline: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: '#334155'
    }
  }, "Password"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontSize: 12,
      color: '#1A56DB',
      fontWeight: 500
    }
  }, "Forgot password?")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: showPw ? 'text' : 'password',
    value: password,
    onChange: e => setPassword(e.target.value),
    style: {
      width: '100%',
      height: 42,
      padding: '0 42px 0 14px',
      border: '1.5px solid #CBD5E1',
      borderRadius: 4,
      fontSize: 14,
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowPw(s => !s),
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: '#94A3B8'
    }
  }, "\uD83D\uDC41"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setRemember(r => !r),
    style: {
      width: 18,
      height: 18,
      borderRadius: 3,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: remember ? '#1A56DB' : '#fff',
      border: `1.5px solid ${remember ? '#1A56DB' : '#CBD5E1'}`
    }
  }, remember && /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "8",
    viewBox: "0 0 10 8",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 4l3 3 5-6",
    stroke: "white",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#475569'
    }
  }, "Remember me for 30 days")), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    style: {
      height: 46,
      background: '#1A56DB',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8
    }
  }, loading ? 'Signing in…' : 'Sign In →')), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 22,
      paddingTop: 18,
      borderTop: '1px solid #F1F5F9'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#64748B'
    }
  }, "New borrower? "), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#1A56DB',
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "Apply for a loan \u2192"))) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setStep('login'),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: '#64748B',
      fontSize: 13,
      fontWeight: 500,
      marginBottom: 28,
      padding: 0
    }
  }, "\u2190 Back to Sign In"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 30
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      background: '#EFF6FF',
      borderRadius: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 16px'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "26",
    height: "26",
    viewBox: "0 0 28 28",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14 3L17 11.5 26 12.7 20 18.8 21.7 27.5 14 23.5 6.3 27.5 8 18.8 2 12.7 11 11.5z",
    stroke: "#1A56DB",
    strokeWidth: "1.8",
    fill: "rgba(26,86,219,0.1)",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      color: '#0F172A',
      letterSpacing: '-0.5px',
      marginBottom: 8
    }
  }, "Verify your identity"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: '#64748B',
      lineHeight: 1.6
    }
  }, "Enter the 6-digit code sent to", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#334155'
    }
  }, masked))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      justifyContent: 'center',
      marginBottom: 16
    }
  }, otp.map((d, i) => /*#__PURE__*/React.createElement("input", {
    key: i,
    maxLength: 1,
    defaultValue: d,
    style: {
      width: 42,
      height: 50,
      border: `1.5px solid ${d ? '#1A56DB' : '#CBD5E1'}`,
      borderRadius: 4,
      fontSize: 22,
      fontWeight: 700,
      textAlign: 'center',
      outline: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#94A3B8'
    }
  }, "Didn't receive a code? "), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#1A56DB',
      fontWeight: 600
    }
  }, "Resend in ", resend, "s")), /*#__PURE__*/React.createElement("button", {
    onClick: verify,
    style: {
      height: 46,
      width: '100%',
      background: '#1A56DB',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, loading ? 'Verifying…' : 'Verify & Sign In →'), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#94A3B8'
    }
  }, "Signing in as "), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: '#334155'
    }
  }, roleLabels[role]))))));
}
window.AuthApp = AuthApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auth/AuthApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/borrower-portal/BorrowerPortalApp.jsx
try { (() => {
function BorrowerPortalApp() {
  const [activeNav, setActiveNav] = React.useState('dashboard');
  const [showPayModal, setShowPayModal] = React.useState(false);
  const [payLoading, setPayLoading] = React.useState(false);
  const navDefs = [{
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'M1.5 1.5h4v4h-4v-4zM8.5 1.5h4v4h-4v-4zM1.5 8.5h4v4h-4v-4zM8.5 8.5h4v4h-4v-4z'
  }, {
    id: 'my-loan',
    label: 'My Loan',
    icon: 'M1 3.5h12v7a1 1 0 01-1 1H2a1 1 0 01-1-1V3.5zM1 6.5h12'
  }, {
    id: 'payments',
    label: 'Payments',
    icon: 'M2 11.5V8M5 11.5V5M8 11.5V7M11 11.5V3'
  }, {
    id: 'documents',
    label: 'Documents',
    icon: 'M3 2.5h6l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1zM9 2.5v3h3'
  }, {
    id: 'apply',
    label: 'Apply for Loan',
    icon: 'M7 1.5v11M1.5 7h11'
  }, {
    id: 'support',
    label: 'Support',
    icon: 'M7 5.5a2 2 0 100 4 2 2 0 000-4zM2.5 12c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4'
  }];
  const stageData = [{
    label: 'Intake & Verification',
    sub: 'Documents received · Jun 10',
    done: true
  }, {
    label: 'Credit Investigation',
    sub: 'CIG visit completed · Jun 12',
    done: true
  }, {
    label: 'Committee Review',
    sub: 'Approved · Jun 13',
    done: true
  }, {
    label: 'Negotiation & Docs',
    sub: 'Terms signed · Jun 14',
    done: true
  }, {
    label: 'Briefing & Release',
    sub: 'Funds released · Jun 15',
    done: true
  }, {
    label: 'Monitoring & Collection',
    sub: 'Active · payments on track',
    done: false,
    active: true
  }];
  const schedule = [{
    num: '07',
    due: 'Jul 15, 2026',
    amount: '₱7,540.50',
    status: 'Due',
    warn: true
  }, {
    num: '08',
    due: 'Aug 15, 2026',
    amount: '₱7,540.50',
    status: 'Upcoming'
  }, {
    num: '09',
    due: 'Sep 15, 2026',
    amount: '₱7,540.50',
    status: 'Upcoming'
  }, {
    num: '10',
    due: 'Oct 15, 2026',
    amount: '₱7,540.50',
    status: 'Upcoming',
    dim: true
  }, {
    num: '11',
    due: 'Nov 15, 2026',
    amount: '₱7,540.50',
    status: 'Upcoming',
    dim: true
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 680,
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
      background: '#F8FAFC'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 224,
      flexShrink: 0,
      background: '#fff',
      borderRight: '1px solid #E2E8F0',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 20px 16px',
      borderBottom: '1px solid #F1F5F9'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      background: 'linear-gradient(135deg,#1A56DB,#1444B8)',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z",
    fill: "white"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: '#0F172A',
      letterSpacing: '-0.4px'
    }
  }, "LoanStar"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#94A3B8',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase'
    }
  }, "My Account")))), /*#__PURE__*/React.createElement("nav", {
    style: {
      padding: 10,
      flex: 1
    }
  }, navDefs.map(item => {
    const active = activeNav === item.id;
    return /*#__PURE__*/React.createElement("div", {
      key: item.id,
      onClick: () => setActiveNav(item.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 10px',
        borderRadius: 5,
        cursor: 'pointer',
        background: active ? '#EFF6FF' : 'transparent',
        marginBottom: 1
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 14 14",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: item.icon,
      stroke: active ? '#1A56DB' : '#475569',
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? '#1A56DB' : '#475569'
      }
    }, item.label));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      borderTop: '1px solid #F1F5F9'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#1A56DB,#60A5FA)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 700,
      color: '#fff'
    }
  }, "J"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#0F172A'
    }
  }, "Juan dela Cruz"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#94A3B8'
    }
  }, "Borrower"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#ECFDF5',
      borderRadius: 4,
      padding: '8px 10px',
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 7,
      height: 7,
      background: '#059669',
      borderRadius: '50%'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: '#065F46'
    }
  }, "Good Standing"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: '#6EE7B7',
      marginLeft: 'auto'
    }
  }, "Credit Score 742")))), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      overflowY: 'auto',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      height: 60,
      background: '#fff',
      borderBottom: '1px solid #E2E8F0',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      padding: '0 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Good morning, Juan \uD83D\uDC4B"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#94A3B8'
    }
  }, "June 16, 2026 \xB7 Loan LN-2026-00142")), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 36,
      padding: '0 16px',
      background: '#1A56DB',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "+ Apply New Loan")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 28px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'linear-gradient(135deg,#1E3A8A 0%,#1A56DB 55%,#2563EB 100%)',
      borderRadius: 8,
      padding: '26px 28px',
      marginBottom: 18,
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: 'rgba(255,255,255,0.55)',
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      marginBottom: 4
    }
  }, "Outstanding Balance"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 42,
      fontWeight: 700,
      color: '#fff',
      letterSpacing: '-1.4px',
      fontVariantNumeric: 'tabular-nums'
    }
  }, "\u20B1 120,648"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.6)',
      marginTop: 6
    }
  }, "16 installments remaining \xB7 LN-2026-00142")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(255,255,255,0.15)',
      borderRadius: 6,
      padding: '10px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.55)',
      marginBottom: 4,
      textTransform: 'uppercase'
    }
  }, "Next Payment"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 700,
      color: '#fff',
      fontVariantNumeric: 'tabular-nums'
    }
  }, "\u20B17,540.50"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.6)'
    }
  }, "Due July 15, 2026"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 16,
      borderTop: '1px solid rgba(255,255,255,0.15)',
      paddingTop: 18
    }
  }, [['Principal', '₱150,000'], ['Interest Rate', '1.5% / mo'], ['Total Paid', '₱49,352'], ['Maturity', 'Nov 2027']].map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.5)',
      textTransform: 'uppercase',
      marginBottom: 4
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: '#fff'
    }
  }, v))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#FFFBEB',
      border: '1px solid #FDE68A',
      borderRadius: 6,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      background: '#FEF3C7',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "4",
    width: "14",
    height: "11",
    rx: "2",
    stroke: "#D97706",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 2v4M13 2v4M2 8h14",
    stroke: "#D97706",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#92400E'
    }
  }, "Payment Due in 29 Days"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#B45309'
    }
  }, "July 15, 2026 \xB7 Installment #9 of 24"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 700,
      color: '#92400E',
      fontVariantNumeric: 'tabular-nums',
      marginBottom: 12
    }
  }, "\u20B1 7,540.50"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowPayModal(true),
    style: {
      flex: 1,
      height: 38,
      background: '#D97706',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "Pay Now"), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 38,
      padding: '0 14px',
      background: 'transparent',
      color: '#B45309',
      border: '1.5px solid #FCD34D',
      borderRadius: 4,
      fontSize: 12,
      cursor: 'pointer'
    }
  }, "Schedule"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#0F172A',
      marginBottom: 12
    }
  }, "Quick Actions"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8
    }
  }, ['View Schedule', 'New Loan', 'Documents', 'Support'].map(label => /*#__PURE__*/React.createElement("button", {
    key: label,
    style: {
      height: 48,
      background: '#F8FAFC',
      border: '1.5px solid #E2E8F0',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: 600,
      color: '#334155'
    }
  }, label))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#0F172A',
      marginBottom: 4
    }
  }, "Loan Progress"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#94A3B8',
      marginBottom: 16
    }
  }, "\u20B149,352 paid of \u20B1150,000 (32.9%)"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      background: '#F1F5F9',
      borderRadius: 4,
      marginBottom: 20,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: '32.9%',
      background: 'linear-gradient(90deg,#1A56DB,#60A5FA)',
      borderRadius: 4
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#94A3B8',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      marginBottom: 12
    }
  }, "Application Stages"), stageData.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.label,
    style: {
      display: 'flex',
      gap: 12,
      paddingBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26,
      height: 26,
      borderRadius: '50%',
      flexShrink: 0,
      background: s.done ? '#1A56DB' : s.active ? '#fff' : '#F8FAFC',
      border: `2px solid ${s.done || s.active ? '#1A56DB' : '#E2E8F0'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: s.done ? '#fff' : '#1A56DB'
    }
  }, s.done ? '✓' : '●')), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: s.active ? 700 : 600,
      color: s.active ? '#0F172A' : '#334155'
    }
  }, s.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: s.active ? '#1A56DB' : '#94A3B8'
    }
  }, s.sub))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 18px',
      borderBottom: '1px solid #F1F5F9',
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Upcoming Payments"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#1A56DB',
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "View all \u2192")), schedule.map(row => /*#__PURE__*/React.createElement("div", {
    key: row.num,
    style: {
      display: 'grid',
      gridTemplateColumns: '32px 1fr 90px 80px',
      padding: '11px 18px',
      borderBottom: '1px solid #F8FAFC',
      alignItems: 'center',
      background: row.warn ? '#FFFCF5' : '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#CBD5E1'
    }
  }, row.num), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: row.warn ? 700 : 400,
      color: row.warn ? '#D97706' : row.dim ? '#94A3B8' : '#334155'
    }
  }, row.due), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      textAlign: 'right',
      color: row.warn ? '#D97706' : '#334155'
    }
  }, row.amount), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: row.warn ? '#FFFBEB' : '#F1F5F9',
      color: row.warn ? '#D97706' : '#64748B',
      fontSize: 10,
      fontWeight: 700,
      padding: '3px 8px',
      borderRadius: 3
    }
  }, row.status)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 18px',
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#94A3B8'
    }
  }, "+ 13 more installments"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: '#334155'
    }
  }, "Total: \u20B1 120,648")))))), showPayModal && /*#__PURE__*/React.createElement("div", {
    onClick: () => setShowPayModal(false),
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,42,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: '#fff',
      borderRadius: 8,
      width: 400,
      boxShadow: '0 24px 48px rgba(15,23,42,0.15)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 22px',
      borderBottom: '1px solid #F1F5F9',
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Confirm Payment"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowPayModal(false),
    style: {
      background: '#F8FAFC',
      border: 'none',
      borderRadius: 4,
      width: 28,
      height: 28,
      cursor: 'pointer'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#F8FAFC',
      borderRadius: 6,
      padding: 14,
      marginBottom: 18,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#64748B'
    }
  }, "Installment"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, "#9 of 24")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      paddingTop: 6,
      borderTop: '1px solid #E2E8F0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 15
    }
  }, "\u20B17,540.50"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowPayModal(false),
    style: {
      flex: 1,
      height: 40,
      background: '#F8FAFC',
      border: '1px solid #E2E8F0',
      borderRadius: 4,
      cursor: 'pointer'
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setPayLoading(true);
      setTimeout(() => {
        setPayLoading(false);
        setShowPayModal(false);
      }, 1200);
    },
    style: {
      flex: 2,
      height: 40,
      background: '#1A56DB',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, payLoading ? 'Processing…' : 'Confirm Payment'))))));
}
window.BorrowerPortalApp = BorrowerPortalApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/borrower-portal/BorrowerPortalApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/loan-application/LoanApplicationApp.jsx
try { (() => {
function LoanApplicationApp() {
  const [step, setStep] = React.useState(1);
  const [success, setSuccess] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [loanAmount, setLoanAmount] = React.useState(150000);
  const [loanMonths, setLoanMonths] = React.useState(24);
  const [docs, setDocs] = React.useState([false, false, true, true, false, false]);
  const [terms, setTerms] = React.useState([true, false, false]);
  const stepLabels = ['Personal Info', 'Loan Details', 'Documents', 'Review'];
  const r = 0.015,
    n = Math.max(1, loanMonths);
  const monthly = loanAmount > 0 ? loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 0;
  const totalPayment = monthly * n;
  const totalInterest = totalPayment - loanAmount;
  const fmt = v => '₱' + Math.round(v).toLocaleString('en-PH');
  const docDefs = [{
    label: 'Valid Government ID',
    hint: "Passport, Driver's License, SSS, PhilHealth",
    required: true
  }, {
    label: 'Income Tax Return (ITR)',
    hint: 'Latest BIR Form 2316',
    required: true
  }, {
    label: 'Certificate of Employment',
    hint: 'Signed by HR — not older than 3 months',
    required: true
  }, {
    label: 'Latest 3 Months Payslips',
    hint: 'Or audited financials for business owners',
    required: true
  }, {
    label: 'Proof of Billing',
    hint: 'Utility bill or bank statement',
    required: false
  }, {
    label: 'Collateral Documents',
    hint: 'Land title, vehicle OR — if applicable',
    required: false
  }];
  const uploadedCount = docs.filter(Boolean).length;
  const canNext = step === 4 ? terms.every(Boolean) : true;
  function next() {
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    if (!canNext) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSuccess(true);
    }, 1200);
  }
  function prev() {
    if (step > 1) setStep(step - 1);
  }
  if (success) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '70px 32px',
        textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 76,
        height: 76,
        background: '#ECFDF5',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "36",
      height: "36",
      viewBox: "0 0 40 40",
      fill: "none"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "20",
      cy: "20",
      r: "19",
      stroke: "#059669",
      strokeWidth: "2",
      fill: "rgba(5,150,105,0.08)"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M11 20l6.5 6.5 11.5-13",
      stroke: "#059669",
      strokeWidth: "2.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 26,
        fontWeight: 800,
        color: '#0F172A',
        letterSpacing: '-0.6px',
        marginBottom: 10
      }
    }, "Application Submitted!"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 1.7,
        maxWidth: 420,
        marginBottom: 10
      }
    }, "Your loan application has been received. Our CSA team will contact you within ", /*#__PURE__*/React.createElement("strong", null, "1\u20133 business days"), "."), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: '#94A3B8',
        fontFamily: 'var(--font-mono)',
        background: '#F8FAFC',
        padding: '6px 16px',
        borderRadius: 4,
        border: '1px solid #E2E8F0',
        marginBottom: 28
      }
    }, "LN-2026-00512"), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setSuccess(false);
        setStep(1);
      },
      style: {
        height: 42,
        padding: '0 20px',
        background: '#F8FAFC',
        color: '#475569',
        border: '1px solid #E2E8F0',
        borderRadius: 4,
        fontSize: 14,
        cursor: 'pointer'
      }
    }, "Start New Application"));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: 640,
      background: '#F8FAFC',
      fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif"
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      background: '#fff',
      borderBottom: '1px solid #E2E8F0',
      position: 'sticky',
      top: 0,
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 820,
      margin: '0 auto',
      padding: '0 28px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26,
      height: 26,
      background: 'linear-gradient(135deg,#1A56DB,#1444B8)',
      borderRadius: 5,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1L8.57 4.84 13 5.38 9.9 8.3l.86 4.7L7 10.5l-3.76 2.5.86-4.7L1 5.38l4.43-.54z",
    fill: "white"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: '#0F172A'
    }
  }, "LoanStar")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#94A3B8'
    }
  }, "Step ", step, " of 4 \xB7 ", stepLabels[step - 1])), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 3,
      background: '#F1F5F9'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      background: '#1A56DB',
      width: `${step * 25}%`,
      transition: 'width .3s'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 820,
      margin: '0 auto',
      padding: '24px 28px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 34
    }
  }, stepLabels.map((label, i) => {
    const num = i + 1;
    const done = num < step,
      active = num === step;
    return /*#__PURE__*/React.createElement("div", {
      key: label,
      style: {
        display: 'flex',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", {
      onClick: () => done && setStep(num),
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        cursor: done ? 'pointer' : 'default'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: done ? '#1A56DB' : active ? '#fff' : '#F8FAFC',
        border: `2px solid ${num <= step ? '#1A56DB' : '#E2E8F0'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active ? '0 0 0 4px rgba(26,86,219,0.12)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: done ? '#fff' : active ? '#1A56DB' : '#CBD5E1'
      }
    }, done ? '✓' : num)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        color: done ? '#334155' : active ? '#0F172A' : '#CBD5E1'
      }
    }, label)), i < 3 && /*#__PURE__*/React.createElement("div", {
      style: {
        width: 64,
        height: 2,
        background: num < step ? '#1A56DB' : '#E2E8F0',
        marginBottom: 16,
        marginLeft: 4,
        marginRight: 4
      }
    }));
  })), step === 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 26px',
      borderBottom: '1px solid #F1F5F9',
      background: '#FAFBFF'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Personal Information"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#64748B',
      marginTop: 3
    }
  }, "Please ensure all details match your government-issued ID.")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 26,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18
    }
  }, [['First Name', 'Juan'], ['Last Name', 'dela Cruz'], ['Mobile Number', '+63 912 345 6789']].map(([label, val]) => /*#__PURE__*/React.createElement("div", {
    key: label
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: '#334155',
      marginBottom: 6
    }
  }, label, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#DC2626'
    }
  }, "*")), /*#__PURE__*/React.createElement("input", {
    defaultValue: val,
    style: {
      width: '100%',
      height: 40,
      padding: '0 14px',
      border: '1.5px solid #CBD5E1',
      borderRadius: 4,
      fontSize: 14,
      outline: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: '#334155',
      marginBottom: 6
    }
  }, "Monthly Income ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#DC2626'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 13,
      top: 11,
      fontSize: 14,
      fontWeight: 600,
      color: '#64748B'
    }
  }, "\u20B1"), /*#__PURE__*/React.createElement("input", {
    defaultValue: "45,000",
    style: {
      width: '100%',
      height: 40,
      padding: '0 14px 0 28px',
      border: '1.5px solid #CBD5E1',
      borderRadius: 4,
      fontSize: 14,
      outline: 'none'
    }
  }))))), step === 2 && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 26px',
      borderBottom: '1px solid #F1F5F9',
      background: '#FAFBFF'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Loan Details"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#64748B',
      marginTop: 3
    }
  }, "Tell us how much you need and how you plan to use it.")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 26
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: '#334155'
    }
  }, "Loan Amount"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 700,
      color: '#1A56DB',
      fontVariantNumeric: 'tabular-nums'
    }
  }, "\u20B1 ", loanAmount.toLocaleString('en-PH'))), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "10000",
    max: "500000",
    step: "5000",
    value: loanAmount,
    onChange: e => setLoanAmount(parseFloat(e.target.value)),
    style: {
      width: '100%',
      accentColor: '#1A56DB'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: '#334155',
      marginBottom: 10
    }
  }, "Loan Term"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, [6, 12, 18, 24, 36].map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    onClick: () => setLoanMonths(m),
    style: {
      height: 34,
      padding: '0 16px',
      background: loanMonths === m ? '#1A56DB' : '#F1F5F9',
      color: loanMonths === m ? '#fff' : '#475569',
      border: 'none',
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, m, " mo")))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'linear-gradient(135deg,#1E3A8A,#1A56DB)',
      borderRadius: 6,
      padding: '18px 22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: 'rgba(255,255,255,0.6)',
      textTransform: 'uppercase',
      marginBottom: 12
    }
  }, "Estimated Repayment (1.5% / month)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 14
    }
  }, [['Monthly', fmt(monthly)], ['Interest', fmt(totalInterest)], ['Total', fmt(totalPayment)]].map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.5)',
      textTransform: 'uppercase',
      marginBottom: 4
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 19,
      fontWeight: 700,
      color: '#fff'
    }
  }, v))))))), step === 3 && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 26px',
      borderBottom: '1px solid #F1F5F9',
      background: '#FAFBFF',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Required Documents"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#64748B',
      marginTop: 3
    }
  }, "Upload clear, readable copies.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#EFF6FF',
      color: '#1A56DB',
      fontSize: 12,
      fontWeight: 700,
      padding: '5px 12px',
      borderRadius: 4
    }
  }, uploadedCount, " / ", docDefs.length, " uploaded")), docDefs.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: d.label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '13px 26px',
      borderBottom: '1px solid #F8FAFC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 6,
      background: docs[i] ? '#ECFDF5' : '#F1F5F9',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: docs[i] ? '#059669' : '#94A3B8'
    }
  }, docs[i] ? '✓' : '＋')), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#334155'
    }
  }, d.label, " ", d.required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#DC2626'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#94A3B8'
    }
  }, d.hint)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDocs(prev2 => prev2.map((v, j) => j === i ? !v : v)),
    style: {
      height: 32,
      padding: '0 14px',
      background: docs[i] ? '#ECFDF5' : '#EFF6FF',
      color: docs[i] ? '#059669' : '#1A56DB',
      border: 'none',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, docs[i] ? 'Uploaded ✓' : 'Upload'))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 26px',
      background: '#FFFBEB',
      borderTop: '1px solid #FDE68A',
      fontSize: 12,
      color: '#92400E',
      lineHeight: 1.6
    }
  }, "All uploaded documents are encrypted and stored securely.")), step === 4 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#94A3B8',
      textTransform: 'uppercase',
      marginBottom: 12
    }
  }, "Personal Info"), [['Full Name', 'Juan dela Cruz'], ['Mobile', '+63 912 345 6789'], ['Monthly Income', '₱45,000']].map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#64748B'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#334155'
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#94A3B8',
      textTransform: 'uppercase',
      marginBottom: 12
    }
  }, "Loan Details"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#64748B'
    }
  }, "Amount"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#1A56DB'
    }
  }, "\u20B1 ", loanAmount.toLocaleString('en-PH'))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#64748B'
    }
  }, "Term"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#334155'
    }
  }, loanMonths, " months")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#64748B'
    }
  }, "Monthly Payment"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, fmt(monthly))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#94A3B8',
      textTransform: 'uppercase',
      marginBottom: 12
    }
  }, "Terms & Agreements"), ['I have read and agree to the Loan Terms and Conditions.', 'I authorize a credit investigation of my financial records.', 'I confirm all information provided is accurate and complete.'].map((txt, i) => /*#__PURE__*/React.createElement("label", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      cursor: 'pointer',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setTerms(t => t.map((v, j) => j === i ? !v : v)),
    style: {
      width: 18,
      height: 18,
      borderRadius: 3,
      flexShrink: 0,
      marginTop: 1,
      background: terms[i] ? '#1A56DB' : '#fff',
      border: `1.5px solid ${terms[i] ? '#1A56DB' : '#CBD5E1'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, terms[i] && /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "8",
    viewBox: "0 0 10 8",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 4l3 3 5-6",
    stroke: "white",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#334155',
      lineHeight: 1.5
    }
  }, txt))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 0 36px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: prev,
    style: {
      height: 42,
      padding: '0 20px',
      background: '#fff',
      color: '#475569',
      border: '1.5px solid #E2E8F0',
      borderRadius: 4,
      fontSize: 14,
      cursor: 'pointer'
    }
  }, step === 1 ? 'Cancel' : '← Back'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, [1, 2, 3, 4].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      width: i === step ? 22 : 8,
      height: 8,
      borderRadius: 4,
      background: i === step ? '#1A56DB' : i < step ? '#BFDBFE' : '#E2E8F0',
      transition: 'all .2s'
    }
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: next,
    disabled: step === 4 && !canNext,
    style: {
      height: 42,
      padding: '0 26px',
      background: step === 4 ? canNext ? '#059669' : '#CBD5E1' : '#1A56DB',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 14,
      fontWeight: 600,
      cursor: step === 4 && !canNext ? 'not-allowed' : 'pointer'
    }
  }, submitting ? 'Submitting…' : step === 4 ? 'Submit Application' : 'Continue →'))));
}
window.LoanApplicationApp = LoanApplicationApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/loan-application/LoanApplicationApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-operations/StaffOperationsApp.jsx
try { (() => {
function StaffOperationsApp() {
  const roles = [{
    id: 'csa',
    label: 'CSA',
    stage: 'Intake & Verification'
  }, {
    id: 'cig',
    label: 'CIG',
    stage: 'Credit Investigation'
  }, {
    id: 'committee',
    label: 'Committee',
    stage: 'Committee Review'
  }, {
    id: 'lra',
    label: 'LRA',
    stage: 'Negotiation'
  }, {
    id: 'collection',
    label: 'Collection',
    stage: 'Monitoring'
  }];
  const allApps = {
    csa: [{
      id: 'LN-2026-00248',
      name: 'Maria Santos',
      amount: '₱80,000',
      status: 'pending',
      purpose: 'Business',
      date: 'Jun 15',
      term: '18 months',
      info: [['Date of Birth', 'Mar 12, 1985'], ['Address', '123 Rizal St, Manila'], ['Employment', 'Business Owner'], ['Monthly Income', '₱45,000']],
      docs: [['Valid Gov ID', 'Submitted', true], ['Income Tax Return', 'Submitted', true], ['Utility Bill', 'Missing', false]]
    }, {
      id: 'LN-2026-00245',
      name: 'Pedro Cruz',
      amount: '₱200,000',
      status: 'pending',
      purpose: 'Real Estate',
      date: 'Jun 14',
      term: '36 months',
      info: [['Date of Birth', 'Jul 8, 1978'], ['Address', '456 Mabini Ave, QC'], ['Employment', 'Self-employed'], ['Monthly Income', '₱80,000']],
      docs: [['Valid Gov ID', 'Submitted', true], ['Income Tax Return', 'Missing', false], ['Bank Statements', 'Missing', false]]
    }],
    cig: [{
      id: 'LN-2026-00246',
      name: 'Ana Garcia',
      amount: '₱50,000',
      status: 'active',
      purpose: 'Education',
      date: 'Jun 14',
      term: '12 months',
      info: [['Date of Birth', 'Sep 3, 1992'], ['Employment', 'Teacher — DepEd'], ['Monthly Income', '₱28,000']],
      docs: [['Valid Gov ID', 'Verified', true], ['Character References', 'Pending visit', false]]
    }],
    committee: [{
      id: 'LN-2026-00248',
      name: 'Maria Santos',
      amount: '₱80,000',
      status: 'pending',
      purpose: 'Business',
      date: 'Jun 15',
      term: '18 months',
      info: [['Recommended by', 'CIG — Ana Reyes'], ['CIG Score', 'B+'], ['Credit Risk', 'Low-Medium']],
      docs: [['CIG Report', 'Complete', true], ['Committee Decision', 'Pending vote', false]]
    }],
    lra: [{
      id: 'LN-2026-00247',
      name: 'Jose Reyes',
      amount: '₱150,000',
      status: 'approved',
      purpose: 'Home Improvement',
      date: 'Jun 15',
      term: '24 months',
      info: [['Interest Rate', '1.5% / month'], ['Monthly Payment', '₱7,540.50'], ['PDC Count', '24 checks']],
      docs: [['Loan Agreement', 'Signed', true], ['Disclosure Statement', 'Pending signature', false]]
    }],
    collection: [{
      id: 'LN-2026-00241',
      name: 'Carlos Aquino',
      amount: '₱45,000',
      status: 'overdue',
      purpose: 'Emergency',
      date: 'Jun 11',
      term: '12 months',
      info: [['Overdue Since', 'May 15, 2026'], ['Overdue Amount', '₱2,354.20'], ['Assigned To', 'Col. Rosa T.']],
      docs: [['Payment Notice Sent', 'Jun 1', true], ['Restructuring Offer', 'Pending response', false]]
    }]
  };
  const actionsByRole = {
    csa: [['Forward to CIG', '#1A56DB', '#fff'], ['Request Documents', '#fff', '#334155'], ['Decline Application', '#FEF2F2', '#DC2626']],
    cig: [['Forward to Committee', '#1A56DB', '#fff'], ['Schedule Visit', '#fff', '#334155'], ['Needs More Docs', '#FFFBEB', '#D97706']],
    committee: [['Approve Loan', '#059669', '#fff'], ['Counter Offer', '#1A56DB', '#fff'], ['Reject Application', '#FEF2F2', '#DC2626']],
    lra: [['Confirm Release', '#059669', '#fff'], ['Update Terms', '#1A56DB', '#fff'], ['Hold Release', '#FFFBEB', '#D97706']],
    collection: [['Mark Paid', '#059669', '#fff'], ['Offer Restructuring', '#1A56DB', '#fff'], ['Escalate', '#FEF2F2', '#DC2626']]
  };
  const statusCfg = {
    pending: ['#FFFBEB', '#D97706', 'Pending'],
    approved: ['#ECFDF5', '#059669', 'Approved'],
    active: ['#EFF6FF', '#1A56DB', 'Active'],
    overdue: ['#FEF2F2', '#DC2626', 'Overdue']
  };
  const avatarColors = ['#1A56DB', '#059669', '#D97706', '#8B5CF6', '#DC2626'];
  const [activeRole, setActiveRole] = React.useState('csa');
  const queue = allApps[activeRole];
  const [selectedId, setSelectedId] = React.useState(queue[0].id);
  React.useEffect(() => {
    setSelectedId(allApps[activeRole][0].id);
  }, [activeRole]);
  const sel = queue.find(a => a.id === selectedId) || queue[0];
  const currentRole = roles.find(r => r.id === activeRole);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 720,
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
      background: '#F8FAFC'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 220,
      flexShrink: 0,
      background: '#fff',
      borderRight: '1px solid #E2E8F0',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px',
      borderBottom: '1px solid #F1F5F9'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      background: 'linear-gradient(135deg,#1A56DB,#1444B8)',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z",
    fill: "white"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: '#0F172A'
    }
  }, "LoanStar"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#94A3B8',
      fontWeight: 600,
      textTransform: 'uppercase'
    }
  }, "Staff Portal")))), /*#__PURE__*/React.createElement("nav", {
    style: {
      padding: '14px 10px',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
      color: '#94A3B8',
      padding: '0 6px 8px'
    }
  }, "Assigned to Ana Reyes"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#64748B',
      padding: '0 6px'
    }
  }, "Use the role switcher (top bar) to change queue.")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      borderTop: '1px solid #F1F5F9',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#059669,#0EA5E9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 700,
      color: '#fff'
    }
  }, "A"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: '#0F172A'
    }
  }, "Ana Reyes"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#94A3B8'
    }
  }, currentRole.stage)))), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      height: 58,
      background: '#fff',
      borderBottom: '1px solid #E2E8F0',
      flexShrink: 0,
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, "Operations Queue"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: '#1A56DB',
      marginLeft: 10
    }
  }, currentRole.stage)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2,
      background: '#F1F5F9',
      padding: 3,
      borderRadius: 9
    }
  }, roles.map(r => {
    const active = activeRole === r.id;
    return /*#__PURE__*/React.createElement("button", {
      key: r.id,
      onClick: () => setActiveRole(r.id),
      style: {
        height: 32,
        padding: '0 12px',
        border: 'none',
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        background: active ? '#fff' : 'transparent',
        color: active ? '#1A56DB' : '#64748B',
        boxShadow: active ? '0 1px 3px rgba(15,23,42,0.12)' : 'none'
      }
    }, r.label);
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '320px 1fr',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRight: '1px solid #E2E8F0',
      overflowY: 'auto',
      background: '#fff'
    }
  }, queue.map((app, i) => {
    const [bg, color, label] = statusCfg[app.status];
    const isSel = app.id === selectedId;
    return /*#__PURE__*/React.createElement("div", {
      key: app.id,
      onClick: () => setSelectedId(app.id),
      style: {
        padding: '12px 14px',
        borderBottom: '1px solid #F8FAFC',
        cursor: 'pointer',
        background: isSel ? '#F0F7FF' : '#fff',
        position: 'relative'
      }
    }, isSel && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: 0,
        top: 6,
        bottom: 6,
        width: 3,
        background: '#1A56DB',
        borderRadius: '0 2px 2px 0'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: avatarColors[i % avatarColors.length],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        color: '#fff'
      }
    }, app.name.split(' ').map(w => w[0]).join('')), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: '#0F172A'
      }
    }, app.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: '#94A3B8',
        fontFamily: 'var(--font-mono)'
      }
    }, app.id))), /*#__PURE__*/React.createElement("span", {
      style: {
        background: bg,
        color,
        fontSize: 10,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 3,
        height: 'fit-content'
      }
    }, label)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: '#0F172A'
      }
    }, app.amount), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: '#94A3B8'
      }
    }, app.date)));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: 'auto',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: '18px 20px',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#94A3B8',
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Application"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, sel.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#64748B',
      fontFamily: 'var(--font-mono)'
    }
  }, sel.id)), /*#__PURE__*/React.createElement("span", {
    style: {
      ...{
        background: statusCfg[sel.status][0],
        color: statusCfg[sel.status][1]
      },
      fontSize: 12,
      fontWeight: 700,
      padding: '5px 12px',
      borderRadius: 4,
      height: 'fit-content'
    }
  }, statusCfg[sel.status][2])), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 14,
      paddingTop: 14,
      borderTop: '1px solid #F1F5F9'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#94A3B8',
      textTransform: 'uppercase',
      marginBottom: 4
    }
  }, "Loan Amount"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 19,
      fontWeight: 700,
      color: '#0F172A'
    }
  }, sel.amount)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#94A3B8',
      textTransform: 'uppercase',
      marginBottom: 4
    }
  }, "Purpose"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: '#0F172A'
    }
  }, sel.purpose)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#94A3B8',
      textTransform: 'uppercase',
      marginBottom: 4
    }
  }, "Term"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: '#0F172A'
    }
  }, sel.term)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#94A3B8',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      marginBottom: 10
    }
  }, "Borrower Information"), sel.info.map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0',
      borderBottom: '1px solid #F8FAFC'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#64748B'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: '#334155'
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#94A3B8',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      marginBottom: 10
    }
  }, "Document Checklist"), sel.docs.map(([label, status, ok]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 0',
      borderBottom: '1px solid #F8FAFC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 16,
      height: 16,
      borderRadius: 3,
      background: ok ? '#ECFDF5' : '#FEF2F2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: ok ? '#059669' : '#DC2626'
    }
  }, ok ? '✓' : '✕')), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: ok ? '#334155' : '#DC2626',
      flex: 1
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      color: ok ? '#059669' : '#D97706'
    }
  }, status))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, actionsByRole[activeRole].map(([label, bg, color]) => /*#__PURE__*/React.createElement("button", {
    key: label,
    style: {
      height: 40,
      padding: '0 18px',
      background: bg,
      color,
      border: bg === '#fff' ? '1.5px solid #E2E8F0' : 'none',
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, label)))))));
}
window.StaffOperationsApp = StaffOperationsApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-operations/StaffOperationsApp.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.DocumentChecklist = __ds_scope.DocumentChecklist;

__ds_ns.SignatureConfirm = __ds_scope.SignatureConfirm;

__ds_ns.StatusTimeline = __ds_scope.StatusTimeline;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.AmortizationTable = __ds_scope.AmortizationTable;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.TopBar = __ds_scope.TopBar;

__ds_ns.PageHeader = __ds_scope.PageHeader;

})();
