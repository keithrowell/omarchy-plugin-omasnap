// Bounded worker pool: stops on the first error, cleans up the rest.
func RunPool[T, R any](ctx context.Context, jobs []T, workers int, fn func(T) (R, error)) ([]R, error) {
	results := make([]R, len(jobs))
	sem := make(chan struct{}, workers)
	group, ctx := errgroup.WithContext(ctx)
	for i, job := range jobs {
		i, job := i, job
		group.Go(func() error {
			sem <- struct{}{}
			defer func() { <-sem }()
			result, err := fn(job)
			if err != nil {
				return fmt.Errorf("job %d: %w", i, err)
			}
			results[i] = result
			return nil
		})
	}
	return results, group.Wait()
}
