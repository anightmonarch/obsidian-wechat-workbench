HTMLElement.prototype.setCssProps = function setCssProps(props: Record<string, string>): void {
  for (const [property, value] of Object.entries(props)) this.style.setProperty(property, value);
};
