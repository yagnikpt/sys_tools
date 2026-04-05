package selector

func (r *rofiSelector) baseArgs() []string {
	args := []string{"-dmenu"}
	if r.config != "" {
		args = append(args, "-theme", r.config)
	}
	return args
}
