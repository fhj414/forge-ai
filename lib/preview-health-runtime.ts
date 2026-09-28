import {
  PREVIEW_HEALTH_CHANNEL,
  PREVIEW_HEALTH_CONNECT_CHANNEL,
  PREVIEW_HEALTH_VERSION,
} from "../types/preview-health";

export function createPreviewHealthRuntime(sessionId: string): string {
  const configuration = JSON.stringify({
    channel: PREVIEW_HEALTH_CHANNEL,
    connectChannel: PREVIEW_HEALTH_CONNECT_CHANNEL,
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
    const toggleEvents = new Set(["click", "input", "change"]);
    const valueEvents = new Set(["input", "change"]);
    const buttonLikeInputTypes = new Set(["button", "submit", "reset", "image"]);
    const observedInteractionEvents = new Set([...activationEvents, "input", "change", "submit"]);
    const registrationsByTarget = new WeakMap();
    const registrations = [];
    let observingRegistrations = true;
    let settled = false;
    let lastReport;
    let activeHealthSender;
    let requestedConnectionNonce;
    let recheckTimer;
    let scheduleFinalReport = () => {};
    const pendingHealthChannels = [];
    const capturedReflectApply = Reflect.apply;
    const capturedSetTimeout = window.setTimeout.bind(window);
    const capturedParentPostMessage = window.parent?.postMessage?.bind(window.parent);
    const capturedGetComputedStyle = window.getComputedStyle;
    const MessageChannelConstructor = window.MessageChannel;
    const capturedEventTargetAdd = window.EventTarget?.prototype?.addEventListener;
    const capturedPortPostMessage = window.MessagePort?.prototype?.postMessage;
    const capturedPortStart = window.MessagePort?.prototype?.start;
    const capturedPortClose = window.MessagePort?.prototype?.close;

    const openHealthChannel = () => {
      try {
        if (
          activeHealthSender ||
          !requestedConnectionNonce ||
          typeof capturedParentPostMessage !== "function" ||
          typeof MessageChannelConstructor !== "function"
        ) {
          return;
        }

        const channelNonce = requestedConnectionNonce;
        const channel = new MessageChannelConstructor();
        const portPostMessage = typeof capturedPortPostMessage === "function"
          ? capturedPortPostMessage
          : channel.port1.postMessage;
        const sender = (payload) =>
          capturedReflectApply(portPostMessage, channel.port1, [payload]);
        const close = () => {
          if (typeof capturedPortClose === "function") {
            capturedReflectApply(capturedPortClose, channel.port1, []);
          } else {
            channel.port1.close?.();
          }
        };
        const pending = { port: channel.port1, sender, close };
        const receiveAcknowledgement = (event) => {
          const acknowledgement = event?.data;
          if (
            acknowledgement?.channel !== configuration.connectChannel ||
            acknowledgement?.version !== configuration.version ||
            acknowledgement?.sessionId !== configuration.sessionId ||
            acknowledgement?.nonce !== channelNonce ||
            acknowledgement?.kind !== "ack"
          ) {
            return;
          }

          activeHealthSender = sender;
          for (const candidate of pendingHealthChannels.splice(0)) {
            if (candidate !== pending) candidate.close();
          }
          if (lastReport) sender(lastReport);
        };
        if (
          typeof capturedPortPostMessage === "function" &&
          typeof capturedEventTargetAdd === "function"
        ) {
          capturedReflectApply(capturedEventTargetAdd, channel.port1, [
            "message",
            receiveAcknowledgement,
          ]);
        } else {
          channel.port1.onmessage = receiveAcknowledgement;
        }
        if (typeof capturedPortStart === "function") {
          capturedReflectApply(capturedPortStart, channel.port1, []);
        } else {
          channel.port1.start?.();
        }
        pendingHealthChannels.push(pending);
        while (pendingHealthChannels.length > 4) {
          pendingHealthChannels.shift()?.close();
        }
        capturedParentPostMessage({
          channel: configuration.connectChannel,
          version: configuration.version,
          sessionId: configuration.sessionId,
          nonce: channelNonce,
          kind: "connect",
        }, "*", [channel.port2]);
      } catch (error) {}
    };

    const sendHealthReport = (payload) => {
      try {
        lastReport = payload;
        if (activeHealthSender) activeHealthSender(payload);
        else openHealthChannel();
      } catch (error) {}
    };

    const receiveHealthConnectionRequest = (event) => {
      try {
        const request = event?.data;
        if (
          request?.channel !== configuration.connectChannel ||
          request?.version !== configuration.version ||
          request?.sessionId !== configuration.sessionId ||
          request?.kind !== "request" ||
          typeof request?.nonce !== "string" ||
          request.nonce.length < 1 ||
          request.nonce.length > 128
        ) {
          return;
        }

        requestedConnectionNonce = request.nonce;
        openHealthChannel();
      } catch (error) {}
    };
    window.addEventListener("message", receiveHealthConnectionRequest);

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
        scheduleFinalReport();
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
            scheduleFinalReport();
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

    const tagNameOf = (element) => {
      try {
        return String(element?.tagName || "").toUpperCase();
      } catch (error) {
        return "";
      }
    };

    const inputTypeOf = (element) => {
      try {
        return String(element?.type || "text").toLowerCase();
      } catch (error) {
        return "text";
      }
    };

    const isButtonLikeAction = (element) => {
      try {
        const tagName = tagNameOf(element);
        const role = String(element?.getAttribute?.("role") || "").toLowerCase();
        return tagName === "BUTTON" || role === "button" ||
          (tagName === "INPUT" && buttonLikeInputTypes.has(inputTypeOf(element)));
      } catch (error) {
        return false;
      }
    };

    const isValueControl = (element) => {
      const tagName = tagNameOf(element);
      return (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA") &&
        !isButtonLikeAction(element);
    };

    const collapsesControlBox = (style) => {
      try {
        const scale = String(style.scale || style.getPropertyValue?.("scale") || "")
          .trim()
          .toLowerCase();
        if (scale && scale !== "none") {
          const scaleValues = scale.split(/[ ,]+/).map(Number).filter(Number.isFinite);
          if (scaleValues.slice(0, 2).some((value) => value === 0)) return true;
        }

        const transform = String(style.transform || "").trim().toLowerCase();
        for (const match of transform.matchAll(/scale(3d|x|y)?\\(([^)]*)\\)/g)) {
          const kind = match[1] || "";
          const values = String(match[2] || "")
            .split(/[ ,]+/)
            .map(Number)
            .filter(Number.isFinite);
          const relevant = kind === "x"
            ? values.slice(0, 1)
            : kind === "y"
              ? values.slice(0, 1)
              : values.slice(0, 2);
          if (relevant.some((value) => value === 0)) return true;
        }

        const matrix = transform.match(/^matrix\\(([^)]*)\\)$/);
        if (matrix) {
          const values = String(matrix[1] || "").split(",").map(Number);
          if (
            values.length === 6 &&
            values.every(Number.isFinite) &&
            values[0] * values[3] - values[1] * values[2] === 0
          ) {
            return true;
          }
        }

        const clip = String(style.clip || "").replace(/\\s+/g, "").toLowerCase();
        const rawClipPath = String(style.clipPath || style.getPropertyValue?.("clip-path") || "")
          .trim()
          .toLowerCase();
        const clipPath = rawClipPath
          .replace(/\\s+/g, "")
          .toLowerCase();
        if (clip === "rect(0px,0px,0px,0px)") return true;

        const inset = rawClipPath.match(/^inset\\(([^)]*)\\)/);
        if (inset) {
          const values = String(inset[1] || "")
            .split(/\\s+round(?:\\s+|$)/, 1)[0]
            .split(/\\s+/)
            .filter(Boolean)
            .map((value) => {
              if (value.endsWith("%")) return Number.parseFloat(value);
              return /^[-+]?0(?:\\.0+)?[a-z]*$/.test(value) ? 0 : NaN;
            });
          let top;
          let right;
          let bottom;
          let left;
          if (values.length === 1) {
            [top, right, bottom, left] = [values[0], values[0], values[0], values[0]];
          } else if (values.length === 2) {
            [top, right, bottom, left] = [values[0], values[1], values[0], values[1]];
          } else if (values.length === 3) {
            [top, right, bottom, left] = [values[0], values[1], values[2], values[1]];
          } else if (values.length === 4) {
            [top, right, bottom, left] = values;
          }
          if (
            [top, right, bottom, left].every(Number.isFinite) &&
            (top + bottom >= 100 || left + right >= 100)
          ) {
            return true;
          }
        }

        return clipPath.startsWith("circle(0") || clipPath.startsWith("ellipse(0");
      } catch (error) {
        return false;
      }
    };

    const computedStyleFor = (element) => {
      try {
        return typeof capturedGetComputedStyle === "function"
          ? capturedReflectApply(capturedGetComputedStyle, window, [element])
          : undefined;
      } catch (error) {
        return undefined;
      }
    };

    const overflowClips = (value) =>
      value === "hidden" || value === "clip" || value === "scroll" || value === "auto";

    const isUnavailableControl = (element) => {
      try {
        if (
          !element ||
          element.hidden ||
          element.hasAttribute?.("hidden") ||
          element.disabled === true ||
          element.getAttribute?.("aria-disabled") === "true" ||
          element.matches?.(":disabled") ||
          element.closest?.("[hidden], [inert], template") ||
          (tagNameOf(element) === "INPUT" && inputTypeOf(element) === "hidden")
        ) {
          return true;
        }

        const closedDetails = element.closest?.("details:not([open])");
        if (closedDetails) {
          const summary = closedDetails.querySelector?.(":scope > summary");
          if (!summary || (element !== summary && !summary.contains?.(element))) {
            return true;
          }
        }

        if (typeof capturedGetComputedStyle === "function") {
          let current = element;
          while (current && current.nodeType === 1) {
            const style = computedStyleFor(current);
            if (
              style &&
              (
                style.display === "none" ||
                style.contentVisibility === "hidden" ||
                Number.parseFloat(style.opacity) === 0 ||
                collapsesControlBox(style) ||
                (current === element &&
                  (style.visibility === "hidden" ||
                    style.visibility === "collapse" ||
                    style.pointerEvents === "none"))
              )
            ) {
              return true;
            }
            current = current.parentElement;
          }
        }

        const viewportWidth = Number(document.documentElement?.clientWidth);
        const viewportHeight = Number(document.documentElement?.clientHeight);
        if (
          viewportWidth > 0 &&
          viewportHeight > 0 &&
          typeof element.getClientRects === "function"
        ) {
          const hasVisibleBox = Array.from(element.getClientRects()).some((rect) => {
            let left = Math.max(0, Number(rect.left));
            let top = Math.max(0, Number(rect.top));
            let right = Math.min(viewportWidth, Number(rect.right));
            let bottom = Math.min(viewportHeight, Number(rect.bottom));
            let ancestor = element.parentElement;

            while (ancestor && right > left && bottom > top) {
              const style = computedStyleFor(ancestor);
              const overflow = String(style?.overflow || "").toLowerCase();
              const clipsHorizontally = overflowClips(overflow) || overflowClips(
                String(style?.overflowX || "").toLowerCase(),
              );
              const clipsVertically = overflowClips(overflow) || overflowClips(
                String(style?.overflowY || "").toLowerCase(),
              );
              if (
                (clipsHorizontally || clipsVertically) &&
                typeof ancestor.getBoundingClientRect === "function"
              ) {
                const ancestorRect = ancestor.getBoundingClientRect();
                if (clipsHorizontally) {
                  left = Math.max(left, Number(ancestorRect.left));
                  right = Math.min(right, Number(ancestorRect.right));
                }
                if (clipsVertically) {
                  top = Math.max(top, Number(ancestorRect.top));
                  bottom = Math.min(bottom, Number(ancestorRect.bottom));
                }
              }
              ancestor = ancestor.parentElement;
            }

            return right > left && bottom > top;
          });
          if (!hasVisibleBox) return true;
        }

        return false;
      } catch (error) {
        return false;
      }
    };

    const compatibleEventsFor = (element) => {
      if (isButtonLikeAction(element)) return activationEvents;
      if (
        tagNameOf(element) === "INPUT" &&
        (inputTypeOf(element) === "checkbox" || inputTypeOf(element) === "radio")
      ) {
        return toggleEvents;
      }
      return valueEvents;
    };

    const isSubmitAction = (element) => {
      try {
        const tagName = tagNameOf(element);
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
      const allActions = Array.from(document.querySelectorAll(
        'button, input, select, textarea, [role="button"]'
      )).filter((element) => !isNativeLink(element) && !isUnavailableControl(element)).slice(0, metricLimit);
      const forms = Array.from(document.querySelectorAll("form"))
        .filter((form) =>
          !isUnavailableControl(form) && allActions.some((element) => form.contains?.(element))
        )
        .slice(0, metricLimit);
      const wiredFormSet = new Set(forms.filter((form) => hasRegisteredType(form, ["submit"])));
      const advertisedActionElements = allActions.filter((element) => {
        const form = owningForm(element);
        if (form && isValueControl(element)) return false;
        return !(form && isSubmitAction(element) && wiredFormSet.has(form));
      });
      const wiredActions = advertisedActionElements.filter((element) =>
        hasRegisteredType(element, compatibleEventsFor(element))
      ).length;
      let delegatedActionListeners = 0;

      for (const registration of registrations) {
        if (!isCallableListener(registration.listener)) continue;
        const delegatesToAction = advertisedActionElements.some((element) =>
          compatibleEventsFor(element).has(registration.type) &&
          containsDescendant(registration.target, [element])
        );
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
        const availableControls = Array.from(document.querySelectorAll(
          'button, input, select, textarea, a[href], [role="button"]'
        )).filter((element) => !isUnavailableControl(element));
        const availableForms = Array.from(document.querySelectorAll("form"))
          .filter((form) => !isUnavailableControl(form));
        return {
          hasMeaningfulContent: Boolean(bodyText || hasVisualElement),
          interactiveControls: count(availableControls),
          forms: count(availableForms),
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

    const report = (status, metrics, reportedIssues = issues) => {
      try {
        sendHealthReport({
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
          issues: status === "issues" ? reportedIssues.slice(0, issueLimit) : [],
          reportedAt: Date.now(),
        });
      } catch (error) {}
    };

    const reportFinal = () => {
      try {
        const metrics = measure();
        const currentIssues = issues.slice(0, issueLimit);
        if (!metrics.hasMeaningfulContent && currentIssues.length < issueLimit) {
          currentIssues.push({ message: "Preview did not render meaningful content" });
        }
        if (metrics.interactionCoverage === "none" && currentIssues.length < issueLimit) {
          currentIssues.push({
            message: "Preview does not expose any enabled, visible app action",
          });
        }
        if (metrics.interactionCoverage === "incomplete") {
          const missingActions = metrics.advertisedActions - metrics.wiredActions;
          const missingForms = metrics.advertisedForms - metrics.wiredForms;
          if (currentIssues.length >= issueLimit) currentIssues.pop();
          currentIssues.push({
            message: "Preview interaction wiring is incomplete: " +
              missingActions + " action(s) and " + missingForms +
              " form(s) lack direct event listeners",
          });
        }
        report(currentIssues.length > 0 ? "issues" : "healthy", metrics, currentIssues);
      } catch (error) {}
    };

    scheduleFinalReport = () => {
      if (!settled) return;
      try {
        if (recheckTimer !== undefined) return;
        recheckTimer = capturedSetTimeout(() => {
          recheckTimer = undefined;
          reportFinal();
        }, 60);
      } catch (error) {
        reportFinal();
      }
    };

    try {
      const MutationObserverConstructor = window.MutationObserver;
      if (
        typeof MutationObserverConstructor === "function" &&
        document.documentElement
      ) {
        const observer = new MutationObserverConstructor(scheduleFinalReport);
        observer.observe(document.documentElement, {
          attributes: true,
          childList: true,
          subtree: true,
          attributeFilter: [
            "aria-disabled",
            "class",
            "disabled",
            "hidden",
            "inert",
            "open",
            "role",
            "style",
            "type",
          ],
        });
      }
    } catch (error) {}

    window.addEventListener("resize", scheduleFinalReport);
    window.addEventListener("transitionend", scheduleFinalReport, true);
    window.addEventListener("animationend", scheduleFinalReport, true);

    const onFailure = (event) => {
      const issueCount = issues.length;
      addIssue(event || {});
      if (settled && issues.length > issueCount) {
        reportFinal();
      }
    };
    const onError = (event) => onFailure(event);
    const onUnhandledRejection = (event) => onFailure(event);
    const reportAfterLoad = () => {
      if (!settled) return;

      const sendFinalReport = () => {
        if (!settled) return;
        reportFinal();
      };

      try {
        window.setTimeout(sendFinalReport, 0);
      } catch (error) {
        sendFinalReport();
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("load", reportAfterLoad, { once: true });

    report("checking", measure());

    const finalize = () => {
      try {
        settled = true;
        reportFinal();
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
