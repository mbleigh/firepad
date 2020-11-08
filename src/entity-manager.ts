import { Entity } from "./entity";
import { assert } from "./utils";

export class EntityManager {
  entities = {};

  constructor() {
    this.entities = {};

    var attrs = ["src", "alt", "width", "height", "style", "class"];
    this.register("img", {
      render: function (info) {
        assert(info.src, "image entity should have 'src'!");
        var attrs = ["src", "alt", "width", "height", "style", "class"];
        var html = "<img ";
        for (var i = 0; i < attrs.length; i++) {
          var attr = attrs[i];
          if (attr in info) {
            html += " " + attr + '="' + info[attr] + '"';
          }
        }
        html += ">";
        return html;
      },
      fromElement: function (element) {
        var info = {};
        for (var i = 0; i < attrs.length; i++) {
          var attr = attrs[i];
          if (element.hasAttribute(attr)) {
            info[attr] = element.getAttribute(attr);
          }
        }
        return info;
      },
    });
  }

  register(type, options) {
    assert(
      options.render,
      "Entity options should include a 'render' function!"
    );
    assert(
      options.fromElement,
      "Entity options should include a 'fromElement' function!"
    );
    this.entities[type] = options;
  }

  renderToElement(entity, entityHandle) {
    return this.tryRenderToElement(entity, "render", entityHandle);
  }

  exportToElement(entity) {
    // Turns out 'export' is a reserved keyword, so 'getHtml' is preferable.
    var elt =
      this.tryRenderToElement(entity, "export") ||
      this.tryRenderToElement(entity, "getHtml") ||
      this.tryRenderToElement(entity, "render");
    elt.setAttribute("data-firepad-entity", entity.type);
    return elt;
  }

  /* Updates a DOM element to reflect the given entity.
     If the entity doesn't support the update method, it is fully
     re-rendered.
  */
  updateElement(entity, element) {
    var type = entity.type;
    var info = entity.info;
    if (
      this.entities[type] &&
      typeof this.entities[type].update != "undefined"
    ) {
      this.entities[type].update(info, element);
    }
  }

  fromElement(element) {
    var type = element.getAttribute("data-firepad-entity");

    // HACK.  This should be configurable through entity registration.
    if (!type) type = element.nodeName.toLowerCase();

    if (type && this.entities[type]) {
      var info = this.entities[type].fromElement(element);
      return new Entity(type, info);
    }
  }

  private tryRenderToElement(entity, renderFn, entityHandle?) {
    var type = entity.type,
      info = entity.info;
    if (this.entities[type] && this.entities[type][renderFn]) {
      var windowDocument = window?.document;
      var res = this.entities[type][renderFn](
        info,
        entityHandle,
        windowDocument
      );
      if (res) {
        if (typeof res === "string") {
          var div = windowDocument.createElement("div");
          div.innerHTML = res;
          return div.childNodes[0];
        } else if (typeof res === "object") {
          assert(
            typeof res.nodeType !== "undefined",
            "Error rendering " +
              type +
              " entity.  render() function" +
              " must return an html string or a DOM element."
          );
          return res;
        }
      }
    }
  }

  entitySupportsUpdate(entityType) {
    return this.entities[entityType] && this.entities[entityType]["update"];
  }
}
