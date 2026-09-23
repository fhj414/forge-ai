import {
  PREVIEW_HEALTH_CHANNEL,
  PREVIEW_HEALTH_VERSION,
} from "../types/preview-health";

export function createPreviewHealthRuntime(sessionId: string): string {
  const configuration = JSON.stringify({
    channel: PREVIEW_HEALTH_CHANNEL,
    version: PREVIEW_HEALTH_VERSION,
    sessionId,
  });

  return `(() => {
  const configuration = ${configuration};

  try {
    const issues = [];
    const issueLimit = 5;
    const metricLimit = 10000;
    const registrationLimit = 10000;
    const activationEvents = new Set(["click", "keydown", "keypress", "keyup"]);
    const observedInteractionEvents = new Set([...activationEvents, "input", "change", "submit"]);
    const registrationsByTarget = new WeakMap();
    const registrations = [];
    let observingRegistrations = true;
    let settled = false;

    const text = (value, limit) => {
      try {
        if (typeof value === "string") return value.slice(0, limit);
        if (value instanceof Error && typeof value.message === "string") {
          return value.message.slice(0, limit);
        }
        try {
          const serialized = JSON.stringify(value);
          if (typeof serialized === "string") return serialized.slice(0, limit);
        } catch (error) {}
        return String(value).slice(0, limit);
      } catch (error) {
        return "Unserializable runtime value";
      }
    };

    const nonNegativeInteger = (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : undefined;

    const optionalText = (value, limit) =>
      value === undefined || value === null ? "" : text(value, limit).trim();

    const count = (elements) => {
      const length = nonNegativeInteger(Number(elements?.length));
      return Math.min(metricLimit, length === undefined ? 0 : length);
    };

    const isCallableListener = (listener) => {
      try {
        return typeof listener === "function" ||
          Boolean(listener && typeof listener.handleEvent === "function");
      } catch (error) {
        return false;
      }
    };

    const isListenerIdentity = (listener) =>
      typeof listener === "function" || Boolean(listener && typeof listener === "object");

    const captureFrom = (options) => {
      if (typeof options === "boolean") return options;
      return Boolean(options && options.capture);
    };

    const recordsFor = (target) => {
      let records = registrationsByTarget.get(target);
      if (!records) {
        records = [];
        registrationsByTarget.set(target, records);
      }
      return records;
    };

    const findRegistration = (target, type, listener, capture) => {
      try {
        return registrationsByTarget.get(target)?.find((registration) =>
          registration.active &&
          registration.type === type &&
          registration.listener === listener &&
          registration.capture === capture
        );
      } catch (error) {
        return undefined;
      }
    };

    let originalAddEventListener;
    let originalRemoveEventListener;

    const deactivateRegistration = (registration) => {
      try {
        if (!registration?.active) return;
        registration.active = false;
        const targetRecords = registrationsByTarget.get(registration.target);
        const targetIndex = targetRecords?.indexOf(registration) ?? -1;
        if (targetIndex >= 0) targetRecords.splice(targetIndex, 1);
        const registrationIndex = registrations.indexOf(registration);
        if (registrationIndex >= 0) registrations.splice(registrationIndex, 1);
        if (registration.signal && registration.abortCleanup && originalRemoveEventListener) {
          originalRemoveEventListener.call(
            registration.signal,
            "abort",
            registration.abortCleanup,
          );
        }
      } catch (error) {}
    };

    try {
      const eventTargetPrototype = window.EventTarget?.prototype;
      originalAddEventListener = eventTargetPrototype?.addEventListener;
      originalRemoveEventListener = eventTargetPrototype?.removeEventListener;
      if (
        typeof originalAddEventListener === "function" &&
        typeof originalRemoveEventListener === "function"
      ) {
        Object.defineProperty(eventTargetPrototype, "addEventListener", {
          configurable: true,
          writable: true,
          value: function(type, listener, options) {
            const normalizedType = typeof type === "string" ? type : "";
            if (
              !observingRegistrations ||
              !observedInteractionEvents.has(normalizedType) ||
              !isListenerIdentity(listener)
            ) {
              return originalAddEventListener.call(this, type, listener, options);
            }

            const capture = captureFrom(options);
            const existing = findRegistration(this, normalizedType, listener, capture);
            if (existing) {
              return originalAddEventListener.call(this, type, existing.wrapper, options);
            }
            if (registrations.length >= registrationLimit) {
              return originalAddEventListener.call(this, type, listener, options);
            }

            const once = Boolean(options && typeof options === "object" && options.once);
            const signal = options && typeof options === "object" ? options.signal : undefined;
            const registration = {
              target: this,
              type: normalizedType,
              listener,
              capture,
              once,
              signal,
              abortCleanup: undefined,
              active: false,
              wrapper: undefined,
            };
            registration.wrapper = function(event) {
              if (registration.once) deactivateRegistration(registration);
              if (typeof registration.listener === "function") {
                return registration.listener.call(this, event);
              }
              const handleEvent = registration.listener?.handleEvent;
              if (typeof handleEvent === "function") {
                return handleEvent.call(registration.listener, event);
              }
            };

            const result = originalAddEventListener.call(this, type, registration.wrapper, options);
            if (signal?.aborted) return result;

            registration.active = true;
            recordsFor(this).push(registration);
            registrations.push(registration);
            if (signal && typeof signal.addEventListener === "function") {
              registration.abortCleanup = () => deactivateRegistration(registration);
              originalAddEventListener.call(
                signal,
                "abort",
                registration.abortCleanup,
                { once: true },
              );
            }
            return result;
          },
        });
        Object.defineProperty(eventTargetPrototype, "removeEventListener", {
          configurable: true,
          writable: true,
          value: function(type, listener, options) {
            const normalizedType = typeof type === "string" ? type : "";
            if (!observedInteractionEvents.has(normalizedType) || !isListenerIdentity(listener)) {
              return originalRemoveEventListener.call(this, type, listener, options);
            }
            const capture = captureFrom(options);
            const registration = findRegistration(
              this,
              normalizedType,
              listener,
              capture,
            );
            if (!registration) {
              return originalRemoveEventListener.call(this, type, listener, options);
            }
            const result = originalRemoveEventListener.call(
              this,
              type,
              registration.wrapper,
              options,
            );
            deactivateRegistration(registration);
            return result;
          },
        });
      }
    } catch (error) {}

    const addIssue = (value) => {
      try {
        if (issues.length >= issueLimit) return;
        const issue = { message: text(value.message || value.error || value.reason || value, 500).trim() || "Unknown runtime error" };
        const source = optionalText(value.source ?? value.filename, 500);
        const line = nonNegativeInteger(value.line ?? value.lineno);
        const column = nonNegativeInteger(value.column ?? value.colno);
        const stack = optionalText(value.stack ?? value.error?.stack, 1500);
        if (source) issue.source = source;
        if (line !== undefined) issue.line = line;
        if (column !== undefined) issue.column = column;
        if (stack) issue.stack = stack;
        issues.push(issue);
      } catch (error) {}
    };

    const addRequiredIssue = (value) => {
      try {
        if (issues.length >= issueLimit) issues.pop();
        addIssue(value);
      } catch (error) {}
    };

    const hasRegisteredType = (target, types) => {
      try {
        const expectedTypes = new Set(types);
        return Boolean(registrationsByTarget.get(target)?.some((registration) =>
          registration.active &&
          isCallableListener(registration.listener) &&
          expectedTypes.has(registration.type)
        ));
      } catch (error) {
        return false;
      }
    };

    const isNativeLink = (element) => {
      try {
        return element?.tagName === "A" && element.hasAttribute?.("href");
      } catch (error) {
        return false;
      }
    };

    const owningForm = (element) => {
      try {
        return element?.form || element?.closest?.("form") || null;
      } catch (error) {
        return null;
      }
    };

    const isSubmitAction = (element) => {
      try {
        const tagName = String(element?.tagName || "").toUpperCase();
        const type = String(element?.type || (tagName === "BUTTON" ? "submit" : "")).toLowerCase();
        return (tagName === "BUTTON" && type === "submit") ||
          (tagName === "INPUT" && (type === "submit" || type === "image"));
      } catch (error) {
        return false;
      }
    };

    const containsDescendant = (target, interactions) => {
      try {
        if (target === window || target === document) return interactions.length > 0;
        return typeof target?.contains === "function" &&
          interactions.some((interaction) => interaction !== target && target.contains(interaction));
      } catch (error) {
        return false;
      }
    };

    const measureInteractions = () => {
      const forms = Array.from(document.querySelectorAll("form")).slice(0, metricLimit);
      const wiredFormSet = new Set(forms.filter((form) => hasRegisteredType(form, ["submit"])));
      const allActions = Array.from(document.querySelectorAll(
        'button, input[type="button"], input[type="submit"], input[type="reset"], input[type="image"], [role="button"]'
      )).filter((element) => !isNativeLink(element)).slice(0, metricLimit);
      const advertisedActionElements = allActions.filter((element) => {
        const form = owningForm(element);
        return !(form && isSubmitAction(element) && wiredFormSet.has(form));
      });
      const activationEventList = Array.from(activationEvents);
      const wiredActions = advertisedActionElements.filter((element) =>
        hasRegisteredType(element, activationEventList)
      ).length;
      let delegatedActionListeners = 0;

      for (const registration of registrations) {
        if (!isCallableListener(registration.listener)) continue;
        const delegatesToAction = activationEvents.has(registration.type) &&
          containsDescendant(registration.target, advertisedActionElements);
        const delegatesToForm = registration.type === "submit" &&
          containsDescendant(registration.target, forms);
        if (delegatesToAction || delegatesToForm) {
          delegatedActionListeners += 1;
          if (delegatedActionListeners >= metricLimit) break;
        }
      }

      const advertisedActions = advertisedActionElements.length;
      const advertisedForms = forms.length;
      const wiredForms = wiredFormSet.size;
      const fullDirectCoverage =
        wiredActions === advertisedActions && wiredForms === advertisedForms;
      const interactionCoverage =
        advertisedActions + advertisedForms === 0
          ? delegatedActionListeners === 0 ? "none" : "unknown"
          : fullDirectCoverage
            ? "complete"
            : delegatedActionListeners > 0 ? "unknown" : "incomplete";

      return {
        advertisedActions,
        wiredActions,
        advertisedForms,
        wiredForms,
        delegatedActionListeners,
        interactionCoverage,
      };
    };

    const measure = () => {
      const resumeObservation = observingRegistrations;
      observingRegistrations = false;
      try {
        const body = document.body;
        const bodyText = typeof body?.innerText === "string" ? body.innerText.trim() : "";
        const hasVisualElement = Boolean(body?.querySelector?.("canvas, svg, img, video"));
        return {
          hasMeaningfulContent: Boolean(bodyText || hasVisualElement),
          interactiveControls: count(document.querySelectorAll("button, input, select, textarea, a[href], [role=\\\"button\\\"]")),
          forms: count(document.querySelectorAll("form")),
          ...measureInteractions(),
        };
      } catch (error) {
        addIssue({ message: error });
        return {
          hasMeaningfulContent: false,
          interactiveControls: 0,
          forms: 0,
          advertisedActions: 0,
          wiredActions: 0,
          advertisedForms: 0,
          wiredForms: 0,
          delegatedActionListeners: 0,
          interactionCoverage: "none",
        };
      } finally {
        observingRegistrations = resumeObservation;
      }
    };

    const report = (status, metrics) => {
      try {
        window.parent?.postMessage({
          channel: configuration.channel,
          version: configuration.version,
          sessionId: configuration.sessionId,
          status,
          hasMeaningfulContent: metrics.hasMeaningfulContent,
          interactiveControls: metrics.interactiveControls,
          forms: metrics.forms,
          advertisedActions: metrics.advertisedActions,
          wiredActions: metrics.wiredActions,
          advertisedForms: metrics.advertisedForms,
          wiredForms: metrics.wiredForms,
          delegatedActionListeners: metrics.delegatedActionListeners,
          interactionCoverage: metrics.interactionCoverage,
          issues: status === "issues" ? issues.slice(0, issueLimit) : [],
          reportedAt: Date.now(),
        }, "*");
      } catch (error) {}
    };

    const onFailure = (event) => {
      const issueCount = issues.length;
      addIssue(event || {});
      if (settled && issues.length > issueCount) {
        report("issues", measure());
      }
    };
    const onError = (event) => onFailure(event);
    const onUnhandledRejection = (event) => onFailure(event);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    report("checking", measure());

    const finalize = () => {
      try {
        const metrics = measure();
        if (!metrics.hasMeaningfulContent) {
          addIssue({ message: "Preview did not render meaningful content" });
        }
        if (metrics.interactionCoverage === "incomplete") {
          const missingActions = metrics.advertisedActions - metrics.wiredActions;
          const missingForms = metrics.advertisedForms - metrics.wiredForms;
          addRequiredIssue({
            message: "Preview interaction wiring is incomplete: " +
              missingActions + " action(s) and " + missingForms +
              " form(s) lack direct event listeners",
          });
        }
        settled = true;
        report(issues.length > 0 ? "issues" : "healthy", metrics);
      } catch (error) {}
    };

    const afterReady = () => {
      try {
        window.setTimeout(finalize, 120);
      } catch (error) {
        finalize();
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", afterReady, { once: true });
    } else {
      afterReady();
    }
  } catch (error) {}
})();`;
}
